import { describe, expect, it } from 'vitest';
import {
  normalizeRepositoryName,
  resolveRepository,
  ToolInputError,
} from './repository-resolver.js';
import { aRepository, fakeApi } from './test/builders.js';

describe('normalizeRepositoryName', () => {
  it.each([
    ['acme/widgets', 'acme/widgets'],
    ['Acme/Widgets', 'acme/widgets'],
    ['https://github.com/acme/widgets', 'acme/widgets'],
    ['https://github.com/acme/widgets.git', 'acme/widgets'],
    ['https://github.com/acme/widgets/', 'acme/widgets'],
    ['https://github.com/acme/widgets/tree/main', 'acme/widgets'],
    ['  acme/widgets  ', 'acme/widgets'],
    ['widgets', 'widgets'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeRepositoryName(input)).toBe(expected);
  });
});

describe('resolveRepository', () => {
  it('finds a repository by id', async () => {
    const api = fakeApi([aRepository({ id: 'r1' }), aRepository({ id: 'r2', name: 'other/repo' })]);
    expect((await resolveRepository(api, 'r2')).name).toBe('other/repo');
  });

  it('finds a repository by name or URL, case-insensitively', async () => {
    const api = fakeApi([aRepository({ id: 'r1', name: 'Acme/Widgets' })]);
    expect((await resolveRepository(api, 'acme/widgets')).id).toBe('r1');
    expect((await resolveRepository(api, 'https://github.com/ACME/widgets.git')).id).toBe('r1');
  });

  it('prefers the newest INDEXED match when a name was indexed more than once', async () => {
    const api = fakeApi([
      aRepository({ id: 'newest-failed', status: 'FAILED' }),
      aRepository({ id: 'newer-indexed', status: 'INDEXED' }),
      aRepository({ id: 'older-indexed', status: 'INDEXED' }),
    ]);
    expect((await resolveRepository(api, 'acme/widgets')).id).toBe('newer-indexed');
  });

  it('falls back to the newest match when none is indexed yet', async () => {
    const api = fakeApi([
      aRepository({ id: 'indexing', status: 'INDEXING' }),
      aRepository({ id: 'old', status: 'FAILED' }),
    ]);
    expect((await resolveRepository(api, 'acme/widgets')).id).toBe('indexing');
  });

  it('tells the model what to do when nothing matches', async () => {
    const attempt = resolveRepository(fakeApi([]), 'nestjs/nest');
    await expect(attempt).rejects.toBeInstanceOf(ToolInputError);
    await expect(attempt).rejects.toThrow(
      /No repository matches "nestjs\/nest".*list_repositories.*index_repository/,
    );
  });

  it('rejects a blank reference without calling the API', async () => {
    const api = fakeApi();
    await expect(resolveRepository(api, '   ')).rejects.toThrow(/required/);
    expect(api.listRepositories).not.toHaveBeenCalled();
  });
});
