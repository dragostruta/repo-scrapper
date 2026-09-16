'use client';

import { useEffect, useState } from 'react';
import type { RepositorySummary } from '@app/shared';
import { ApiError, createRepository, getRepository, listRepositories } from '@/lib/api';

const STATUS_LABEL: Record<RepositorySummary['status'], string> = {
  PENDING: 'Queued',
  CLONING: 'Cloning repository',
  INDEXING: 'Chunking and embedding',
  INDEXED: 'Ready',
  FAILED: 'Failed',
};

const TERMINAL_STATUSES: RepositorySummary['status'][] = ['INDEXED', 'FAILED'];

export function RepoIntake({
  onIndexed,
  resume,
}: {
  onIndexed: (repo: RepositorySummary) => void;
  /** A repo restored from localStorage that was still cloning/indexing when
   * the page was last open - resumes polling instead of showing a blank form. */
  resume?: RepositorySummary;
}) {
  const [url, setUrl] = useState('');
  const [repo, setRepo] = useState<RepositorySummary | null>(resume ?? null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pollingId, setPollingId] = useState<string | null>(
    resume && !TERMINAL_STATUSES.includes(resume.status) ? resume.id : null,
  );
  const [previouslyIndexed, setPreviouslyIndexed] = useState<RepositorySummary[]>([]);

  // Best-effort - an empty or failed list just means the "previously indexed"
  // section doesn't show, not a blocking error for the intake screen itself.
  useEffect(() => {
    listRepositories()
      .then((repos) => setPreviouslyIndexed(repos.filter((r) => r.status === 'INDEXED')))
      .catch(() => undefined);
  }, []);

  // Single effect owns the interval's lifetime, so it's always cleared - on
  // unmount, on a status change, or when a fresh submit replaces the id.
  useEffect(() => {
    if (!pollingId) return;

    const interval = setInterval(async () => {
      try {
        const current = await getRepository(pollingId);
        setRepo(current);
        if (current.status === 'INDEXED') {
          setPollingId(null);
          onIndexed(current);
        } else if (current.status === 'FAILED') {
          setPollingId(null);
        }
      } catch {
        setPollingId(null);
        setError('Lost connection to the API while indexing.');
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [pollingId, onIndexed]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = await createRepository(url.trim());
      setRepo(created);
      if (created.status === 'INDEXED') onIndexed(created);
      else setPollingId(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the API.');
    } finally {
      setSubmitting(false);
    }
  }

  function handlePick(existing: RepositorySummary) {
    onIndexed(existing);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Code Documentation Assistant</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Paste a public GitHub repository URL. It gets shallow-cloned, chunked and embedded
          locally, then you can ask questions with answers cited to file and line.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          disabled={submitting || (repo !== null && repo.status !== 'FAILED')}
          className="flex-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={submitting || (repo !== null && repo.status !== 'FAILED')}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[#0b0d10] disabled:opacity-50"
        >
          Index
        </button>
      </form>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {repo && repo.status !== 'FAILED' && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-4 py-3 text-sm">
          {repo.status !== 'INDEXED' && (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
          )}
          <span>
            {repo.name} &middot; {STATUS_LABEL[repo.status]}
            {repo.status === 'INDEXED'
              ? ` · ${repo.chunkCount} chunks across ${repo.fileCount} files`
              : ''}
          </span>
        </div>
      )}

      {repo?.status === 'FAILED' && (
        <div className="rounded-lg border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
          {repo.error ?? 'Indexing failed.'}
        </div>
      )}

      {previouslyIndexed.length > 0 && !repo && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">
            Already indexed
          </p>
          <ul className="divide-y divide-[var(--color-border-subtle)] overflow-hidden rounded-lg border border-[var(--color-border-subtle)]">
            {previouslyIndexed.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => handlePick(r)}
                  className="flex w-full items-center justify-between bg-[var(--color-surface-raised)] px-4 py-2.5 text-left text-sm hover:bg-[var(--color-border-subtle)]"
                >
                  <span>{r.name}</span>
                  <span className="text-xs text-[var(--color-ink-muted)]">
                    {r.chunkCount} chunks &middot; {r.revision.slice(0, 7)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
