'use client';

import { useState } from 'react';
import type { RepositorySummary } from '@app/shared';
import { ApiError, createRepository } from '@/lib/api';

const STATUS_LABEL: Record<RepositorySummary['status'], string> = {
  PENDING: 'Queued',
  CLONING: 'Cloning repository',
  INDEXING: 'Chunking and embedding',
  INDEXED: 'Ready',
  FAILED: 'Failed',
};

export function RepoIntake({ onIndexed }: { onIndexed: (repo: RepositorySummary) => void }) {
  const [url, setUrl] = useState('');
  const [repo, setRepo] = useState<RepositorySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = await createRepository(url.trim());
      setRepo(created);
      if (created.status === 'INDEXED') onIndexed(created);
      else pollUntilDone(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the API.');
    } finally {
      setSubmitting(false);
    }
  }

  function pollUntilDone(id: string) {
    const interval = setInterval(async () => {
      try {
        const { getRepository } = await import('@/lib/api');
        const current = await getRepository(id);
        setRepo(current);
        if (current.status === 'INDEXED') {
          clearInterval(interval);
          onIndexed(current);
        } else if (current.status === 'FAILED') {
          clearInterval(interval);
        }
      } catch {
        clearInterval(interval);
        setError('Lost connection to the API while indexing.');
      }
    }, 2000);
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
            {repo.status === 'INDEXED' ? ` · ${repo.chunkCount} chunks across ${repo.fileCount} files` : ''}
          </span>
        </div>
      )}

      {repo?.status === 'FAILED' && (
        <div className="rounded-lg border border-rose-900/50 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
          {repo.error ?? 'Indexing failed.'}
        </div>
      )}
    </div>
  );
}
