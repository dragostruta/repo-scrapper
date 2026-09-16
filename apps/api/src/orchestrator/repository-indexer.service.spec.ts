import { aParsedRepo, aWalkedFile } from '../../test/helpers/builders';
import { createFakeLogger } from '../../test/helpers/fake-logger';
import { RepositoryCloneError } from '../common/errors/domain-errors';
import type { FileWalkerService } from '../ingest/file-walker.service';
import type { GithubClonerService } from '../ingest/github-cloner.service';
import type { ChunkStore } from '../persistence/chunk.store';
import type { RepositoryStore } from '../persistence/repository.store';
import type { FileIndexerService } from './file-indexer.service';
import { RepositoryIndexerService } from './repository-indexer.service';

function setup() {
  const calls: string[] = [];
  const cloner = {
    clone: jest.fn(async () => {
      calls.push('clone');
      return { dir: '/tmp/clone-x/repo', revision: 'sha-1' };
    }),
    cleanup: jest.fn(async () => {
      calls.push('cleanup');
    }),
  };
  const walker = {
    walk: jest.fn(async () => [
      aWalkedFile({ relativePath: 'a.ts' }),
      aWalkedFile({ relativePath: 'b.ts' }),
    ]),
  };
  const fileIndexer = { indexFile: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(4) };
  const chunks = {
    deleteForRepository: jest.fn(async () => {
      calls.push('delete-old-chunks');
    }),
  };
  const repositories = {
    markIndexing: jest.fn(async () => {
      calls.push('markIndexing');
    }),
    markIndexed: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
  const logger = createFakeLogger();
  const service = new RepositoryIndexerService(
    cloner as unknown as GithubClonerService,
    walker as unknown as FileWalkerService,
    fileIndexer as unknown as FileIndexerService,
    chunks as unknown as ChunkStore,
    repositories as unknown as RepositoryStore,
    logger,
  );
  return { service, cloner, walker, fileIndexer, chunks, repositories, logger, calls };
}

describe('RepositoryIndexerService', () => {
  it('clones, indexes every file and marks the repository INDEXED', async () => {
    const { service, repositories, fileIndexer, walker, calls } = setup();

    await service.index('r1', aParsedRepo());

    expect(walker.walk).toHaveBeenCalledWith('/tmp/clone-x/repo');
    expect(repositories.markIndexing).toHaveBeenCalledWith('r1', 'sha-1');
    expect(fileIndexer.indexFile).toHaveBeenCalledTimes(2);
    expect(repositories.markIndexed).toHaveBeenCalledWith('r1', { fileCount: 2, chunkCount: 7 });
    expect(repositories.markFailed).not.toHaveBeenCalled();
    expect(calls).toEqual(['clone', 'markIndexing', 'delete-old-chunks', 'cleanup']);
  });

  it('marks an empty repository INDEXED with zero counts', async () => {
    const { service, walker, repositories } = setup();
    walker.walk.mockResolvedValue([]);
    await service.index('r1', aParsedRepo());
    expect(repositories.markIndexed).toHaveBeenCalledWith('r1', { fileCount: 0, chunkCount: 0 });
  });

  it('records a clone failure without throwing, and has nothing to clean up', async () => {
    const { service, cloner, repositories } = setup();
    cloner.clone.mockRejectedValue(new RepositoryCloneError('Could not clone acme/widgets.'));

    await expect(service.index('r1', aParsedRepo())).resolves.toBeUndefined();

    expect(repositories.markFailed).toHaveBeenCalledWith('r1', 'Could not clone acme/widgets.');
    expect(repositories.markIndexing).not.toHaveBeenCalled();
    expect(cloner.cleanup).not.toHaveBeenCalled();
  });

  it('records a failure part-way through and still removes the clone', async () => {
    const { service, fileIndexer, repositories, cloner } = setup();
    fileIndexer.indexFile.mockReset().mockRejectedValue(new Error('embedding model crashed'));

    await service.index('r1', aParsedRepo());

    expect(repositories.markFailed).toHaveBeenCalledWith('r1', 'embedding model crashed');
    expect(repositories.markIndexed).not.toHaveBeenCalled();
    expect(cloner.cleanup).toHaveBeenCalledWith('/tmp/clone-x/repo');
  });

  it('never throws even if the failure cannot be recorded', async () => {
    const { service, walker, repositories, logger } = setup();
    walker.walk.mockRejectedValue(new Error('disk gone'));
    repositories.markFailed.mockRejectedValue(new Error('db gone'));

    await expect(service.index('r1', aParsedRepo())).resolves.toBeUndefined();
    expect(logger.logs.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'db gone' }),
      'could not record indexing failure',
    );
  });

  it('never throws if removing the clone fails', async () => {
    const { service, cloner, repositories, logger } = setup();
    cloner.cleanup.mockRejectedValue(new Error('EBUSY'));

    await expect(service.index('r1', aParsedRepo())).resolves.toBeUndefined();
    expect(repositories.markIndexed).toHaveBeenCalled();
    expect(logger.logs.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'EBUSY' }),
      expect.any(String),
    );
  });
});
