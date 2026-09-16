import type { Repository } from '@prisma/client';
import type { RepositorySummary } from '@app/shared';

/** Maps the Prisma row to the shape both the web client and (later) the MCP
 * adapter consume - keeps @prisma/client's generated type out of everything
 * downstream of the orchestrator. */
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
