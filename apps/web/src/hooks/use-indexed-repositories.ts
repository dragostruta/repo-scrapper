'use client';

import { useEffect, useState } from 'react';
import type { RepositorySummary } from '@app/shared';
import { listRepositories } from '@/lib/api';

/** Repositories ready to chat with, newest first. Best effort: if the list
 * can't be loaded the intake screen simply doesn't show it. */
export function useIndexedRepositories(): RepositorySummary[] {
  const [repositories, setRepositories] = useState<RepositorySummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    listRepositories()
      .then((all) => {
        if (!cancelled) setRepositories(all.filter((r) => r.status === 'INDEXED'));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return repositories;
}
