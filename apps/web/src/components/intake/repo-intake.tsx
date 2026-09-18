'use client';

import type { RepositorySummary } from '@app/shared';
import { useIndexedRepositories } from '@/hooks/use-indexed-repositories';
import { useRepositoryIndexing } from '@/hooks/use-repository-indexing';
import { IndexedRepositoryList } from './indexed-repository-list';
import { IndexingStatus } from './indexing-status';
import { RepositoryUrlForm } from './repository-url-form';

export function RepoIntake({
  onIndexed,
  resume,
}: {
  onIndexed: (repository: RepositorySummary) => void;
  /** A remembered repository that was still indexing when the page was last open. */
  resume?: RepositorySummary | null;
}) {
  const { repository, error, busy, submit } = useRepositoryIndexing(onIndexed, resume);
  const indexed = useIndexedRepositories();

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Code Documentation Assistant</h1>
        <p className="text-sm text-ink-muted">
          Paste a public GitHub repository URL. It gets shallow-cloned, chunked and embedded
          locally, then you can ask questions with answers cited to file and line.
        </p>
      </header>

      <RepositoryUrlForm onSubmit={(url) => void submit(url)} disabled={busy} />

      {error && (
        <p role="alert" className="text-sm text-rose-400">
          {error}
        </p>
      )}
      {repository && <IndexingStatus repository={repository} />}
      {!repository && <IndexedRepositoryList repositories={indexed} onPick={onIndexed} />}
    </div>
  );
}
