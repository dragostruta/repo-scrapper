import type { AskResponse, RepositorySummary, SearchHit } from '@app/shared';
import { vi } from 'vitest';
import type { RepositoryApi } from '../api-client.js';

export function aRepository(overrides: Partial<RepositorySummary> = {}): RepositorySummary {
  return {
    id: 'repo-1',
    source: 'GITHUB',
    url: 'https://github.com/acme/widgets.git',
    name: 'acme/widgets',
    revision: 'abcdef1234567890',
    status: 'INDEXED',
    error: null,
    fileCount: 3,
    chunkCount: 12,
    indexedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function aSearchHit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    chunkId: 'chunk-1',
    path: 'src/auth.ts',
    startLine: 10,
    endLine: 20,
    symbol: 'login',
    language: 'typescript',
    score: 0.81,
    content: 'export function login() {}',
    ...overrides,
  };
}

export function anAskResponse(overrides: Partial<AskResponse> = {}): AskResponse {
  const { content: _content, ...citation } = aSearchHit();
  return {
    answer: 'Login hashes the password.',
    citations: [citation],
    timings: { embedQuestion: 1, retrieve: 2, generate: 3, total: 6 },
    traceId: 'trace-1',
    ...overrides,
  };
}

/** A RepositoryApi whose every method is a mock, pre-loaded with one indexed repository. */
export function fakeApi(repositories: RepositorySummary[] = [aRepository()]) {
  return {
    listRepositories: vi.fn(async () => repositories),
    getRepository: vi.fn(
      async (id: string) => repositories.find((r) => r.id === id) ?? aRepository({ id }),
    ),
    createRepository: vi.fn(async () => aRepository({ status: 'CLONING' })),
    ask: vi.fn(async () => anAskResponse()),
    search: vi.fn(async () => ({
      results: [aSearchHit()],
      timings: { embedQuestion: 1, retrieve: 2 },
    })),
    getChunkExcerpt: vi.fn(async () => {
      const { chunkId: _id, score: _score, ...excerpt } = aSearchHit();
      return excerpt;
    }),
  } satisfies RepositoryApi;
}
