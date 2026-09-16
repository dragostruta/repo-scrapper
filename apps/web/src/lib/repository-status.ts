import type { RepositoryStatus } from '@app/shared';

export const STATUS_LABEL: Record<RepositoryStatus, string> = {
  PENDING: 'Queued',
  CLONING: 'Cloning repository',
  INDEXING: 'Chunking and embedding',
  INDEXED: 'Ready',
  FAILED: 'Failed',
};

/** Statuses after which a repository will not change without a new request. */
export function isTerminal(status: RepositoryStatus): boolean {
  return status === 'INDEXED' || status === 'FAILED';
}

export function shortRevision(revision: string): string {
  return revision.slice(0, 7);
}
