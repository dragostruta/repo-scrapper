import { Injectable } from '@nestjs/common';
import type { RepositorySummary } from '@app/shared';
import { AppConfig } from '../config/app-config';
import { AppLogger } from '../common/logging/logger.service';
import { RepositoryNotFoundError } from '../common/errors/domain-errors';
import { errorMessage } from '../common/errors/error-message';
import { Semaphore } from '../common/semaphore';
import { GithubClonerService } from '../ingest/github-cloner.service';
import { parseGithubUrl, type ParsedGithubRepo } from '../ingest/parse-github-url';
import { RepositoryStore } from '../persistence/repository.store';
import { RepositoryIndexerService } from './repository-indexer.service';

/** Stored until the clone reports the real commit sha. */
export const PENDING_REVISION = 'pending';

export const INTERRUPTED_MESSAGE = 'Indexing was interrupted by a server restart.';

/**
 * Entry point for adding and reading repositories - the one thing the HTTP
 * controller (and any other adapter) calls. It decides *whether* to index;
 * RepositoryIndexerService does the indexing.
 *
 * (source, name, revision) is unique, so the same repo at the same commit is
 * indexed once: an INDEXED match is returned as a cache hit, an in-flight
 * match is returned as-is, and a FAILED match is retried in place.
 */
@Injectable()
export class IngestOrchestratorService {
  private readonly logger;
  /** Caps how many repositories are cloned and embedded at the same time. */
  private readonly indexingSlots: Semaphore;

  constructor(
    private readonly config: AppConfig,
    private readonly cloner: GithubClonerService,
    private readonly indexer: RepositoryIndexerService,
    private readonly repositories: RepositoryStore,
    logger: AppLogger,
  ) {
    this.logger = logger.forContext('IngestOrchestratorService');
    this.indexingSlots = new Semaphore(this.config.ingest.maxConcurrentIndexing);
  }

  /** Returns immediately; indexing continues in the background (D8). */
  async ingestGithubRepo(rawUrl: string): Promise<RepositorySummary> {
    const repo = parseGithubUrl(rawUrl, this.config.ingest.allowedHosts);
    const headSha = await this.cloner.resolveHeadSha(repo.cloneUrl);
    const existing = headSha
      ? await this.repositories.findGithubRevision(repo.name, headSha)
      : null;

    return existing ? this.reuseExisting(existing, repo) : this.createAndIndex(repo, headSha);
  }

  async getRepository(id: string): Promise<RepositorySummary> {
    const repository = await this.repositories.findById(id);
    if (!repository) throw new RepositoryNotFoundError(id);
    return repository;
  }

  listRepositories(): Promise<RepositorySummary[]> {
    return this.repositories.list();
  }

  /** Called once at boot: a row still PENDING, CLONING or INDEXING can't
   * really be running after a restart - the in-memory indexing queue died with
   * the process - so mark it FAILED and therefore retryable. */
  async recoverInterruptedIndexing(): Promise<void> {
    const count = await this.repositories.failInProgress(INTERRUPTED_MESSAGE);
    if (count > 0) {
      this.logger.warn({ count }, 'marked interrupted repositories as FAILED on boot');
    }
  }

  private async reuseExisting(
    existing: RepositorySummary,
    repo: ParsedGithubRepo,
  ): Promise<RepositorySummary> {
    if (existing.status === 'FAILED') {
      const retried = await this.repositories.markCloning(existing.id);
      this.indexInBackground(retried.id, repo);
      return retried;
    }
    if (existing.status === 'INDEXED') {
      this.logger.info(
        { repo: repo.name, revision: existing.revision },
        'cache hit - already indexed',
      );
    }
    return existing;
  }

  private async createAndIndex(
    repo: ParsedGithubRepo,
    headSha: string | null,
  ): Promise<RepositorySummary> {
    // Two concurrent ingests before a sha is known can each create a row -
    // acknowledged in the README's known limitations, not solved here.
    const created = await this.repositories.createGithub({
      url: repo.cloneUrl,
      name: repo.name,
      revision: headSha ?? PENDING_REVISION,
    });
    this.indexInBackground(created.id, repo);
    return created;
  }

  /**
   * Hands the repository to the indexer without waiting for it, but only
   * MAX_CONCURRENT_INDEXING of them actually run at once - the rest queue.
   * The indexer records its own failures; the catch here only guards against
   * a bug escaping it as an unhandled rejection.
   */
  private indexInBackground(repositoryId: string, repo: ParsedGithubRepo): void {
    if (this.indexingSlots.activeCount >= this.config.ingest.maxConcurrentIndexing) {
      this.logger.info(
        { repositoryId, queued: this.indexingSlots.queuedCount + 1 },
        'indexing queued - concurrency limit reached',
      );
    }

    void this.indexingSlots
      .run(() => this.indexer.index(repositoryId, repo))
      .catch((err: unknown) =>
        this.logger.error(
          { repositoryId, err: errorMessage(err) },
          'indexing rejected unexpectedly',
        ),
      );
  }
}
