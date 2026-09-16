import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RepositorySummary } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfig } from '../config/app-config';
import { AppLogger } from '../common/logging/logger.service';
import { GithubClonerService } from '../ingest/github-cloner.service';
import { FileWalkerService } from '../ingest/file-walker.service';
import { parseGithubUrl, type ParsedGithubRepo } from '../ingest/parse-github-url';
import { ChunkerService } from '../chunking/chunker.service';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../embedding/embedding-provider';
import { ChunkRepository, type ChunkToInsert } from '../retrieval/chunk-repository.service';
import { toRepositorySummary } from './repository-mapper';

/**
 * Owns the ingest side of the pipeline end to end: parse -> cache check ->
 * clone -> walk -> chunk -> embed -> persist -> INDEXED. This is the one
 * place that sequence exists; the HTTP controller and (later) the MCP
 * adapter both call ingestGithubRepo and nothing else.
 *
 * Indexing runs as a detached background task (D8: no queue in v1) - the
 * caller gets the repository row back in PENDING/CLONING immediately and
 * polls getRepository() for status. An API restart mid-index leaves the row
 * stuck; sweepOrphaned() (called at boot) marks those FAILED so they are
 * retryable instead of silently stuck forever.
 */
@Injectable()
export class IngestOrchestratorService {
  private readonly logger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly cloner: GithubClonerService,
    private readonly walker: FileWalkerService,
    private readonly chunker: ChunkerService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    private readonly chunkRepository: ChunkRepository,
    logger: AppLogger,
  ) {
    this.logger = logger.forContext('IngestOrchestratorService');
  }

  async ingestGithubRepo(rawUrl: string): Promise<RepositorySummary> {
    const parsed = parseGithubUrl(rawUrl, this.config.ingest.allowedHosts);
    const probableSha = await this.cloner.resolveHeadSha(parsed.cloneUrl);

    if (probableSha) {
      const existing = await this.prisma.repository.findUnique({
        where: { source_name_revision: { source: 'GITHUB', name: parsed.name, revision: probableSha } },
      });
      if (existing?.status === 'INDEXED') {
        this.logger.info({ repo: parsed.name, revision: probableSha }, 'cache hit - already indexed');
        return toRepositorySummary(existing);
      }
    }

    // Concurrent ingests of the same repo before a real revision is known can
    // each create their own PENDING row - acknowledged, not solved, in the
    // README's known limitations (matches the take-home's own "edge cases to
    // acknowledge, not necessarily solve" guidance).
    const repository = await this.prisma.repository.create({
      data: {
        source: 'GITHUB',
        url: parsed.cloneUrl,
        name: parsed.name,
        revision: probableSha ?? 'pending',
        status: 'CLONING',
      },
    });

    void this.runIndexing(repository.id, parsed).catch((err: unknown) => {
      // runIndexing already persists FAILED status internally; this catch
      // only guards against something throwing outside that try/catch.
      this.logger.error(
        { repositoryId: repository.id, err: err instanceof Error ? err.message : String(err) },
        'indexing rejected unexpectedly',
      );
    });

    return toRepositorySummary(repository);
  }

  async getRepository(id: string): Promise<RepositorySummary | null> {
    const repo = await this.prisma.repository.findUnique({ where: { id } });
    return repo ? toRepositorySummary(repo) : null;
  }

  async listRepositories(): Promise<RepositorySummary[]> {
    const repos = await this.prisma.repository.findMany({ orderBy: { createdAt: 'desc' } });
    return repos.map(toRepositorySummary);
  }

  /** Called once at boot (see main.ts). A row left in CLONING/INDEXING after
   * a restart cannot still be running - mark it FAILED so it shows up as
   * retryable instead of hanging the UI forever. */
  async sweepOrphaned(): Promise<void> {
    const { count } = await this.prisma.repository.updateMany({
      where: { status: { in: ['CLONING', 'INDEXING'] } },
      data: { status: 'FAILED', error: 'Indexing was interrupted by a server restart.' },
    });
    if (count > 0) {
      this.logger.warn({ count }, 'marked orphaned in-progress repositories as FAILED on boot');
    }
  }

  private async runIndexing(repositoryId: string, parsed: ParsedGithubRepo): Promise<void> {
    let clonedDir: string | null = null;

    try {
      const cloned = await this.cloner.clone(parsed);
      clonedDir = cloned.dir;

      await this.prisma.repository.update({
        where: { id: repositoryId },
        data: { revision: cloned.revision, status: 'INDEXING' },
      });

      const files = await this.walker.walk(cloned.dir);

      // Safe to call on a fresh row (no-op); makes re-running a FAILED
      // repository through this same path safe too.
      await this.chunkRepository.deleteForRepository(repositoryId);

      let chunkCount = 0;
      for (const file of files) {
        const candidates = await this.chunker.chunkFile(file.content, file.language);
        if (candidates.length === 0) continue;

        const vectors = await this.embeddings.embed(candidates.map((c) => c.content));
        const toInsert: ChunkToInsert[] = candidates.map((c, i) => ({
          filePath: file.relativePath,
          language: file.language,
          symbol: c.symbol,
          startLine: c.startLine,
          endLine: c.endLine,
          content: c.content,
          tokenCount: Math.ceil(c.content.length / 4),
          embedding: vectors[i],
        }));

        await this.chunkRepository.insertMany(repositoryId, toInsert);
        chunkCount += toInsert.length;
      }

      await this.prisma.repository.update({
        where: { id: repositoryId },
        data: {
          status: 'INDEXED',
          fileCount: files.length,
          chunkCount,
          indexedAt: new Date(),
          error: null,
        },
      });

      this.logger.info({ repositoryId, fileCount: files.length, chunkCount }, 'indexing completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ repositoryId, err: message }, 'indexing failed');
      await this.prisma.repository
        .update({ where: { id: repositoryId }, data: { status: 'FAILED', error: message.slice(0, 2000) } })
        .catch(() => undefined);
    } finally {
      if (clonedDir) await this.cloner.cleanup(clonedDir).catch(() => undefined);
    }
  }
}

/** Small helper so the controller can 404 cleanly without repeating the
 * findRepository-or-throw pattern. */
export async function requireRepository(
  service: IngestOrchestratorService,
  id: string,
): Promise<RepositorySummary> {
  const repo = await service.getRepository(id);
  if (!repo) throw new NotFoundException(`Repository ${id} not found`);
  return repo;
}
