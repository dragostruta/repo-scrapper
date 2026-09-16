import type { Repository } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { RepositoryStore } from './repository.store';

const row = (overrides: Partial<Repository> = {}): Repository => ({
  id: 'r1',
  source: 'GITHUB',
  url: 'https://github.com/a/b.git',
  name: 'a/b',
  revision: 'sha',
  status: 'CLONING',
  error: null,
  fileCount: 0,
  chunkCount: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  indexedAt: null,
  ...overrides,
});

function setup() {
  const repository = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(async ({ data }) => row(data)),
    update: jest.fn(async ({ data }) => row(data)),
    updateMany: jest.fn(),
  };
  const store = new RepositoryStore({ repository } as unknown as PrismaService);
  return { store, repository };
}

describe('RepositoryStore', () => {
  it('findById returns null for an unknown id', async () => {
    const { store, repository } = setup();
    repository.findUnique.mockResolvedValue(null);
    expect(await store.findById('missing')).toBeNull();
  });

  it('findById maps the row', async () => {
    const { store, repository } = setup();
    repository.findUnique.mockResolvedValue(row({ id: 'r9' }));
    expect(await store.findById('r9')).toMatchObject({
      id: 'r9',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('findGithubRevision looks up by the unique (source, name, revision) key', async () => {
    const { store, repository } = setup();
    repository.findUnique.mockResolvedValue(null);
    await store.findGithubRevision('a/b', 'abc');
    expect(repository.findUnique).toHaveBeenCalledWith({
      where: { source_name_revision: { source: 'GITHUB', name: 'a/b', revision: 'abc' } },
    });
  });

  it('list returns newest first', async () => {
    const { store, repository } = setup();
    repository.findMany.mockResolvedValue([row({ id: 'new' }), row({ id: 'old' })]);
    expect((await store.list()).map((r) => r.id)).toEqual(['new', 'old']);
    expect(repository.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
  });

  it('createGithub starts a repository in CLONING', async () => {
    const { store, repository } = setup();
    const created = await store.createGithub({ url: 'u', name: 'a/b', revision: 'pending' });
    expect(repository.create).toHaveBeenCalledWith({
      data: { source: 'GITHUB', url: 'u', name: 'a/b', revision: 'pending', status: 'CLONING' },
    });
    expect(created.status).toBe('CLONING');
  });

  it('markCloning clears a previous error for a retry', async () => {
    const { store, repository } = setup();
    await store.markCloning('r1');
    expect(repository.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'CLONING', error: null },
    });
  });

  it('markIndexing records the real revision', async () => {
    const { store, repository } = setup();
    await store.markIndexing('r1', 'real-sha');
    expect(repository.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { revision: 'real-sha', status: 'INDEXING' },
    });
  });

  it('markIndexed stores counts and a completion time', async () => {
    const { store, repository } = setup();
    await store.markIndexed('r1', { fileCount: 3, chunkCount: 9 });
    expect(repository.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: {
        status: 'INDEXED',
        fileCount: 3,
        chunkCount: 9,
        indexedAt: expect.any(Date),
        error: null,
      },
    });
  });

  it('markFailed truncates very long error messages', async () => {
    const { store, repository } = setup();
    await store.markFailed('r1', 'e'.repeat(5000));
    const { data } = repository.update.mock.calls[0][0];
    expect(data.status).toBe('FAILED');
    expect(data.error).toHaveLength(2000);
  });

  it('failInProgress fails only CLONING/INDEXING rows and returns the count', async () => {
    const { store, repository } = setup();
    repository.updateMany.mockResolvedValue({ count: 2 });
    expect(await store.failInProgress('restarted')).toBe(2);
    expect(repository.updateMany).toHaveBeenCalledWith({
      where: { status: { in: ['CLONING', 'INDEXING'] } },
      data: { status: 'FAILED', error: 'restarted' },
    });
  });
});
