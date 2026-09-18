import type { RepositorySummary } from '@app/shared';
import { shortRevision } from '@/lib/repository-status';

export function IndexedRepositoryList({
  repositories,
  onPick,
}: {
  repositories: RepositorySummary[];
  onPick: (repository: RepositorySummary) => void;
}) {
  if (repositories.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide text-ink-muted">Already indexed</h2>
      <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle">
        {repositories.map((repository) => (
          <li key={repository.id}>
            <button
              type="button"
              onClick={() => onPick(repository)}
              className="flex w-full items-center justify-between bg-surface-raised px-4 py-2.5 text-left text-sm hover:bg-border-subtle"
            >
              <span>{repository.name}</span>
              <span className="text-xs text-ink-muted">
                {repository.chunkCount} chunks &middot; {shortRevision(repository.revision)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
