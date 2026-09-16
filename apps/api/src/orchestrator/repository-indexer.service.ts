import { Injectable } from '@nestjs/common';
import { AppLogger } from '../common/logging/logger.service';
import { errorMessage } from '../common/errors/error-message';
import { FileWalkerService } from '../ingest/file-walker.service';
import { type ClonedRepo, GithubClonerService } from '../ingest/github-cloner.service';
import type { ParsedGithubRepo } from '../ingest/parse-github-url';
import { ChunkStore } from '../persistence/chunk.store';
import { type IndexStats, RepositoryStore } from '../persistence/repository.store';
import { FileIndexerService } from './file-indexer.service';

/**
 * Runs the indexing pipeline for one repository: clone -> walk -> index every
 * file -> INDEXED. Designed to run in the background (D8), so it never
 * throws: any failure is recorded on the repository as FAILED with a
 * readable reason, and the temporary clone is always removed.
 */
@Injectable()
export class RepositoryIndexerService {
  private readonly logger;

  constructor(
    private readonly cloner: GithubClonerService,
    private readonly walker: FileWalkerService,
    private readonly fileIndexer: FileIndexerService,
    private readonly chunks: ChunkStore,
    private readonly repositories: RepositoryStore,
    logger: AppLogger,
  ) {
    this.logger = logger.forContext('RepositoryIndexerService');
  }

  async index(repositoryId: string, repo: ParsedGithubRepo): Promise<void> {
    let cloned: ClonedRepo | null = null;
    try {
      cloned = await this.cloner.clone(repo);
      await this.repositories.markIndexing(repositoryId, cloned.revision);
      const stats = await this.indexWorkingTree(repositoryId, cloned.dir);
      await this.repositories.markIndexed(repositoryId, stats);
      this.logger.info({ repositoryId, ...stats }, 'indexing completed');
    } catch (err) {
      await this.recordFailure(repositoryId, err);
    } finally {
      if (cloned) await this.removeClone(cloned.dir);
    }
  }

  /** Replaces any chunks from an earlier attempt, so a retry never duplicates them. */
  private async indexWorkingTree(repositoryId: string, dir: string): Promise<IndexStats> {
    const files = await this.walker.walk(dir);
    await this.chunks.deleteForRepository(repositoryId);

    let chunkCount = 0;
    for (const file of files) {
      chunkCount += await this.fileIndexer.indexFile(repositoryId, file);
    }
    return { fileCount: files.length, chunkCount };
  }

  private async recordFailure(repositoryId: string, err: unknown): Promise<void> {
    const message = errorMessage(err);
    this.logger.error({ repositoryId, err: message }, 'indexing failed');
    await this.repositories
      .markFailed(repositoryId, message)
      .catch((storeErr: unknown) =>
        this.logger.error(
          { repositoryId, err: errorMessage(storeErr) },
          'could not record indexing failure',
        ),
      );
  }

  private async removeClone(dir: string): Promise<void> {
    await this.cloner
      .cleanup(dir)
      .catch((err: unknown) =>
        this.logger.warn({ dir, err: errorMessage(err) }, 'could not remove temporary clone'),
      );
  }
}
