import type { Repository } from '@prisma/client';
import { toRepositorySummary } from './repository.mapper';

const row: Repository = {
  id: 'r1',
  source: 'GITHUB',
  url: 'https://github.com/a/b.git',
  name: 'a/b',
  revision: 'sha',
  status: 'INDEXED',
  error: null,
  fileCount: 2,
  chunkCount: 5,
  createdAt: new Date('2026-02-03T04:05:06.000Z'),
  updatedAt: new Date('2026-02-03T05:00:00.000Z'),
  indexedAt: new Date('2026-02-03T04:10:00.000Z'),
};

describe('toRepositorySummary', () => {
  it('maps a row to the public shape with ISO dates and no internal fields', () => {
    expect(toRepositorySummary(row)).toEqual({
      id: 'r1',
      source: 'GITHUB',
      url: 'https://github.com/a/b.git',
      name: 'a/b',
      revision: 'sha',
      status: 'INDEXED',
      error: null,
      fileCount: 2,
      chunkCount: 5,
      indexedAt: '2026-02-03T04:10:00.000Z',
      createdAt: '2026-02-03T04:05:06.000Z',
    });
  });

  it('keeps indexedAt null for a repository that never finished indexing', () => {
    expect(toRepositorySummary({ ...row, indexedAt: null, status: 'FAILED' }).indexedAt).toBeNull();
  });
});
