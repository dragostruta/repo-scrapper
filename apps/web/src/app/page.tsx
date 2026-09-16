'use client';

import { useEffect, useState } from 'react';
import type { RepositorySummary } from '@app/shared';
import { RepoIntake } from '@/components/repo-intake';
import { ChatPanel } from '@/components/chat-panel';
import { getRepository } from '@/lib/api';

/** Only the id is persisted - everything else is re-fetched, so a repo that
 * changed (or was removed) server-side is never shown from a stale cache. */
const STORAGE_KEY = 'repo-scrapper:activeRepoId';

export default function Home() {
  const [repo, setRepo] = useState<RepositorySummary | null>(null);
  const [resume, setResume] = useState<RepositorySummary | undefined>(undefined);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    const savedId = window.localStorage.getItem(STORAGE_KEY);
    if (!savedId) {
      setRestoring(false);
      return;
    }
    getRepository(savedId)
      .then((found) => {
        if (found.status === 'INDEXED') setRepo(found);
        else setResume(found); // still cloning/indexing/failed - let RepoIntake resume it
      })
      .catch(() => window.localStorage.removeItem(STORAGE_KEY))
      .finally(() => setRestoring(false));
  }, []);

  function handleIndexed(next: RepositorySummary) {
    window.localStorage.setItem(STORAGE_KEY, next.id);
    setRepo(next);
  }

  function handleSwitchRepo() {
    window.localStorage.removeItem(STORAGE_KEY);
    setResume(undefined);
    setRepo(null);
  }

  if (restoring) return null;
  if (!repo) return <RepoIntake onIndexed={handleIndexed} resume={resume} />;
  return <ChatPanel repo={repo} onSwitchRepo={handleSwitchRepo} />;
}
