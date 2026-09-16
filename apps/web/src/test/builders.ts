import type { AskResponse, Citation, RepositorySummary } from '@app/shared';

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

export function aCitation(overrides: Partial<Citation> = {}): Citation {
  return {
    chunkId: 'chunk-1',
    path: 'src/auth.ts',
    startLine: 10,
    endLine: 20,
    symbol: 'login',
    language: 'typescript',
    score: 0.81,
    ...overrides,
  };
}

export function anAskResponse(overrides: Partial<AskResponse> = {}): AskResponse {
  return {
    answer: 'Login hashes the password in `src/auth.ts`.',
    citations: [aCitation()],
    timings: { embedQuestion: 5, retrieve: 10, generate: 300, total: 320 },
    traceId: 'trace-1',
    ...overrides,
  };
}

/** A promise you resolve or reject from the test, to hold a request "in flight". */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
