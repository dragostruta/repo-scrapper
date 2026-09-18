import type { RepositorySummary } from '@app/shared';
import { STATUS_LABEL } from '@/lib/repository-status';

export function IndexingStatus({ repository }: { repository: RepositorySummary }) {
  if (repository.status === 'FAILED') {
    return (
      <div
        role="alert"
        className="rounded-lg border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-300"
      >
        {repository.error ?? 'Indexing failed.'}
      </div>
    );
  }

  const ready = repository.status === 'INDEXED';
  return (
    <div
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-sm"
    >
      {!ready && (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      )}
      <span>
        {repository.name} &middot; {STATUS_LABEL[repository.status]}
        {ready ? ` · ${repository.chunkCount} chunks across ${repository.fileCount} files` : ''}
      </span>
    </div>
  );
}
