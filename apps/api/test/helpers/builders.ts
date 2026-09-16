import type { RepositorySummary } from '@app/shared';
import type { ChunkCandidate } from '../../src/chunking/chunk.types';
import type { WalkedFile } from '../../src/ingest/file-walker.service';
import type { ParsedGithubRepo } from '../../src/ingest/parse-github-url';
import type { RetrievedChunk } from '../../src/persistence/chunk.store';

export function aRepository(overrides: Partial<RepositorySummary> = {}): RepositorySummary {
  return {
    id: 'repo-1',
    source: 'GITHUB',
    url: 'https://github.com/acme/widgets.git',
    name: 'acme/widgets',
    revision: 'a'.repeat(40),
    status: 'INDEXED',
    error: null,
    fileCount: 3,
    chunkCount: 12,
    indexedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function aParsedRepo(overrides: Partial<ParsedGithubRepo> = {}): ParsedGithubRepo {
  return {
    cloneUrl: 'https://github.com/acme/widgets.git',
    name: 'acme/widgets',
    host: 'github.com',
    ...overrides,
  };
}

export function aRetrievedChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: 'chunk-1',
    filePath: 'src/auth.ts',
    language: 'typescript',
    symbol: 'login',
    startLine: 10,
    endLine: 20,
    content: 'export function login() {}',
    score: 0.8123,
    ...overrides,
  };
}

export function aWalkedFile(overrides: Partial<WalkedFile> = {}): WalkedFile {
  return {
    relativePath: 'src/auth.ts',
    absolutePath: '/tmp/repo/src/auth.ts',
    language: 'typescript',
    content: 'export function login() {}',
    ...overrides,
  };
}

export function aChunkCandidate(overrides: Partial<ChunkCandidate> = {}): ChunkCandidate {
  return {
    content: 'export function login() {}',
    startLine: 1,
    endLine: 1,
    symbol: 'login',
    ...overrides,
  };
}
