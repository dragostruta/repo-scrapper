import type { RepositorySummary } from '@app/shared';
import type { RepositoryApi } from './api-client.js';

/** A tool argument that can't be acted on; its message tells the model what to do instead. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

/**
 * "owner/name" in lower case, from any of the forms a model or a person is
 * likely to pass: `acme/widgets`, `https://github.com/acme/widgets(.git)`.
 */
export function normalizeRepositoryName(reference: string): string {
  const withoutHost = reference
    .trim()
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  const [owner, name] = withoutHost.split('/');
  return owner && name ? `${owner}/${name}`.toLowerCase() : withoutHost.toLowerCase();
}

/**
 * Finds the repository a tool call refers to, by id or by name. When the same
 * name was indexed at several commits, the newest INDEXED one wins (the API
 * lists newest first), falling back to the newest of any status.
 */
export async function resolveRepository(
  api: RepositoryApi,
  reference: string,
): Promise<RepositorySummary> {
  const ref = reference.trim();
  if (!ref) throw new ToolInputError('A repository id or "owner/name" is required.');

  const repositories = await api.listRepositories();
  const byId = repositories.find((r) => r.id === ref);
  if (byId) return byId;

  const name = normalizeRepositoryName(ref);
  const matches = repositories.filter((r) => r.name.toLowerCase() === name);
  if (matches.length === 0) {
    throw new ToolInputError(
      `No repository matches "${ref}". Call list_repositories to see what is indexed, ` +
        'or index_repository to add it.',
    );
  }
  return matches.find((r) => r.status === 'INDEXED') ?? matches[0]!;
}
