'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RepositorySummary } from '@app/shared';
import { createRepository, describeError, getRepository } from '@/lib/api';
import { isTerminal } from '@/lib/repository-status';
import { useLatest } from './use-latest';

export const POLL_INTERVAL_MS = 2000;

export interface RepositoryIndexingState {
  repository: RepositorySummary | null;
  error: string | null;
  submitting: boolean;
  /** Indexing is in flight - the form should not accept a new URL. */
  busy: boolean;
  submit: (url: string) => Promise<void>;
}

/**
 * Submits a repository URL and follows it until it's INDEXED (then calls
 * `onIndexed`) or FAILED. `resume` continues polling a repository that was
 * still indexing when the page was last open.
 */
export function useRepositoryIndexing(
  onIndexed: (repository: RepositorySummary) => void,
  resume?: RepositorySummary | null,
): RepositoryIndexingState {
  const [repository, setRepository] = useState<RepositorySummary | null>(resume ?? null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pollingId, setPollingId] = useState<string | null>(
    resume && !isTerminal(resume.status) ? resume.id : null,
  );
  const onIndexedRef = useLatest(onIndexed);

  const track = useCallback(
    (current: RepositorySummary) => {
      setRepository(current);
      if (current.status === 'INDEXED') onIndexedRef.current(current);
      setPollingId(isTerminal(current.status) ? null : current.id);
    },
    [onIndexedRef],
  );

  useEffect(() => {
    if (!pollingId) return;
    const interval = setInterval(() => {
      getRepository(pollingId)
        .then(track)
        .catch(() => {
          setPollingId(null);
          setError('Lost connection to the API while indexing.');
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollingId, track]);

  const submit = useCallback(
    async (url: string) => {
      const trimmed = url.trim();
      if (!trimmed) return;
      setSubmitting(true);
      setError(null);
      try {
        track(await createRepository(trimmed));
      } catch (err) {
        setError(describeError(err, 'Could not reach the API.'));
      } finally {
        setSubmitting(false);
      }
    },
    [track],
  );

  const busy = submitting || (repository !== null && repository.status !== 'FAILED');
  return { repository, error, submitting, busy, submit };
}
