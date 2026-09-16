'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RepositorySummary } from '@app/shared';
import { getRepository } from '@/lib/api';
import { storage } from '@/lib/storage';

/** Only the id is remembered; everything else is re-fetched, so a repo that
 * changed or disappeared server-side is never shown from a stale copy. */
export const ACTIVE_REPOSITORY_KEY = 'repo-scrapper:activeRepoId';

export interface ActiveRepositoryState {
  /** True until the remembered repository (if any) has been looked up. */
  restoring: boolean;
  /** A repository ready to chat with. */
  active: RepositorySummary | null;
  /** A remembered repository that was still indexing (or failed) - intake resumes it. */
  resumable: RepositorySummary | null;
  select: (repository: RepositorySummary) => void;
  clear: () => void;
}

export function useActiveRepository(): ActiveRepositoryState {
  const [restoring, setRestoring] = useState(true);
  const [active, setActive] = useState<RepositorySummary | null>(null);
  const [resumable, setResumable] = useState<RepositorySummary | null>(null);

  useEffect(() => {
    const savedId = storage.get(ACTIVE_REPOSITORY_KEY);
    if (!savedId) {
      setRestoring(false);
      return;
    }
    getRepository(savedId)
      .then((found) => (found.status === 'INDEXED' ? setActive(found) : setResumable(found)))
      .catch(() => storage.remove(ACTIVE_REPOSITORY_KEY))
      .finally(() => setRestoring(false));
  }, []);

  const select = useCallback((repository: RepositorySummary) => {
    storage.set(ACTIVE_REPOSITORY_KEY, repository.id);
    setActive(repository);
  }, []);

  const clear = useCallback(() => {
    storage.remove(ACTIVE_REPOSITORY_KEY);
    setResumable(null);
    setActive(null);
  }, []);

  return { restoring, active, resumable, select, clear };
}
