'use client';

import { ChatPanel } from '@/components/chat/chat-panel';
import { RepoIntake } from '@/components/intake/repo-intake';
import { useActiveRepository } from '@/hooks/use-active-repository';

export default function Home() {
  const { restoring, active, resumable, select, clear } = useActiveRepository();

  if (restoring) return null;
  if (!active) return <RepoIntake onIndexed={select} resume={resumable} />;

  return <ChatPanel key={active.id} repo={active} onSwitchRepo={clear} />;
}
