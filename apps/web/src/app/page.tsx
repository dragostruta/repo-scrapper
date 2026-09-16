'use client';

import { useState } from 'react';
import type { RepositorySummary } from '@app/shared';
import { RepoIntake } from '@/components/repo-intake';
import { ChatPanel } from '@/components/chat-panel';

export default function Home() {
  const [repo, setRepo] = useState<RepositorySummary | null>(null);

  if (!repo) {
    return <RepoIntake onIndexed={setRepo} />;
  }
  return <ChatPanel repo={repo} />;
}
