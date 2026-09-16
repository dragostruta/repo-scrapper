import { aRepository } from '../../test/helpers/builders';
import { createFakeLogger } from '../../test/helpers/fake-logger';
import type { AppConfig } from '../config/app-config';
import {
  InvalidRepositorySourceError,
  RepositoryNotFoundError,
} from '../common/errors/domain-errors';
import type { GithubClonerService } from '../ingest/github-cloner.service';
import type { RepositoryStore } from '../persistence/repository.store';
import {
  INTERRUPTED_MESSAGE,
  IngestOrchestratorService,
  PENDING_REVISION,
} from './ingest-orchestrator.service';
import type { RepositoryIndexerService } from './repository-indexer.service';

const URL = 'https://github.com/acme/widgets';
const SHA = 'c'.repeat(40);

function setup() {
  const cloner = { resolveHeadSha: jest.fn().mockResolvedValue(SHA) };
  const indexer = { index: jest.fn().mockResolvedValue(undefined) };
  const repositories = {
    findGithubRevision: jest.fn().mockResolvedValue(null),
    createGithub: jest.fn(async (input) => aRepository({ id: 'new', status: 'CLONING', ...input })),
    markCloning: jest.fn(async (id: string) => aRepository({ id, status: 'CLONING' })),
    findById: jest.fn(),
    list: jest.fn(),
    failInProgress: jest.fn(),
  };
  const logger = createFakeLogger();
  const config = { ingest: { allowedHosts: ['github.com'] } } as unknown as AppConfig;
  const service = new IngestOrchestratorService(
    config,
    cloner as unknown as GithubClonerService,
    indexer as unknown as RepositoryIndexerService,
    repositories as unknown as RepositoryStore,
    logger,
  );
  return { service, cloner, indexer, repositories, logger };
}

describe('IngestOrchestratorService.ingestGithubRepo', () => {
  it('rejects an invalid URL before touching git or the database', async () => {
    const { service, cloner, repositories } = setup();
    await expect(service.ingestGithubRepo('http://github.com/a/b')).rejects.toThrow(
      InvalidRepositorySourceError,
    );
    expect(cloner.resolveHeadSha).not.toHaveBeenCalled();
    expect(repositories.createGithub).not.toHaveBeenCalled();
  });

  it('creates and starts indexing a repository it has not seen at this commit', async () => {
    const { service, repositories, indexer } = setup();

    const result = await service.ingestGithubRepo(URL);

    expect(repositories.findGithubRevision).toHaveBeenCalledWith('acme/widgets', SHA);
    expect(repositories.createGithub).toHaveBeenCalledWith({
      url: 'https://github.com/acme/widgets.git',
      name: 'acme/widgets',
      revision: SHA,
    });
    expect(result.status).toBe('CLONING');
    expect(indexer.index).toHaveBeenCalledWith(
      'new',
      expect.objectContaining({ name: 'acme/widgets' }),
    );
  });

  it('uses a placeholder revision and skips the cache when HEAD cannot be resolved', async () => {
    const { service, cloner, repositories, indexer } = setup();
    cloner.resolveHeadSha.mockResolvedValue(null);

    await service.ingestGithubRepo(URL);

    expect(repositories.findGithubRevision).not.toHaveBeenCalled();
    expect(repositories.createGithub).toHaveBeenCalledWith(
      expect.objectContaining({ revision: PENDING_REVISION }),
    );
    expect(indexer.index).toHaveBeenCalled();
  });

  it('returns an already-indexed repository without re-indexing (cache hit)', async () => {
    const { service, repositories, indexer } = setup();
    const indexed = aRepository({ status: 'INDEXED' });
    repositories.findGithubRevision.mockResolvedValue(indexed);

    expect(await service.ingestGithubRepo(URL)).toBe(indexed);
    expect(indexer.index).not.toHaveBeenCalled();
    expect(repositories.createGithub).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'CLONING', 'INDEXING'] as const)(
    'returns an in-flight %s repository instead of starting a second index',
    async (status) => {
      const { service, repositories, indexer } = setup();
      const inFlight = aRepository({ status });
      repositories.findGithubRevision.mockResolvedValue(inFlight);

      expect(await service.ingestGithubRepo(URL)).toBe(inFlight);
      expect(indexer.index).not.toHaveBeenCalled();
    },
  );

  it('retries a FAILED repository in place', async () => {
    const { service, repositories, indexer } = setup();
    repositories.findGithubRevision.mockResolvedValue(
      aRepository({ id: 'failed-1', status: 'FAILED' }),
    );

    const result = await service.ingestGithubRepo(URL);

    expect(repositories.markCloning).toHaveBeenCalledWith('failed-1');
    expect(repositories.createGithub).not.toHaveBeenCalled();
    expect(result.status).toBe('CLONING');
    expect(indexer.index).toHaveBeenCalledWith('failed-1', expect.anything());
  });

  it('returns before indexing finishes, and logs if indexing rejects', async () => {
    const { service, indexer, logger } = setup();
    let reject!: (err: Error) => void;
    indexer.index.mockReturnValue(new Promise((_resolve, r) => (reject = r)));

    await expect(service.ingestGithubRepo(URL)).resolves.toBeDefined();

    reject(new Error('unexpected bug'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(logger.logs.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'unexpected bug' }),
      'indexing rejected unexpectedly',
    );
  });
});

describe('IngestOrchestratorService reads', () => {
  it('getRepository returns the repository', async () => {
    const { service, repositories } = setup();
    repositories.findById.mockResolvedValue(aRepository({ id: 'r1' }));
    expect((await service.getRepository('r1')).id).toBe('r1');
  });

  it('getRepository throws RepositoryNotFoundError for an unknown id', async () => {
    const { service, repositories } = setup();
    repositories.findById.mockResolvedValue(null);
    await expect(service.getRepository('nope')).rejects.toThrow(RepositoryNotFoundError);
  });

  it('listRepositories delegates to the store', async () => {
    const { service, repositories } = setup();
    repositories.list.mockResolvedValue([aRepository()]);
    expect(await service.listRepositories()).toHaveLength(1);
  });
});

describe('IngestOrchestratorService.recoverInterruptedIndexing', () => {
  it('fails in-progress rows with an explanation and warns when there were any', async () => {
    const { service, repositories, logger } = setup();
    repositories.failInProgress.mockResolvedValue(2);

    await service.recoverInterruptedIndexing();

    expect(repositories.failInProgress).toHaveBeenCalledWith(INTERRUPTED_MESSAGE);
    expect(logger.logs.warn).toHaveBeenCalledWith({ count: 2 }, expect.any(String));
  });

  it('stays quiet when nothing was interrupted', async () => {
    const { service, repositories, logger } = setup();
    repositories.failInProgress.mockResolvedValue(0);
    await service.recoverInterruptedIndexing();
    expect(logger.logs.warn).not.toHaveBeenCalled();
  });
});
