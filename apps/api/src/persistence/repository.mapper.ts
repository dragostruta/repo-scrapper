import type { Repository } from '@prisma/client';
import type { RepositorySummary } from '@app/shared';

/** Prisma row -> the public shape every client (web, MCP) consumes. */
export function toRepositorySummary(repo: Repository): RepositorySummary {
  return {
    id: repo.id,
    source: repo.source,
    url: repo.url,
    name: repo.name,
    revision: repo.revision,
    status: repo.status,
    error: repo.error,
    fileCount: repo.fileCount,
    chunkCount: repo.chunkCount,
    indexedAt: repo.indexedAt ? repo.indexedAt.toISOString() : null,
    createdAt: repo.createdAt.toISOString(),
  };
}
