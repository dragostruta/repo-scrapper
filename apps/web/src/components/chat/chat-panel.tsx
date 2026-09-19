'use client';

import type { RepositorySummary } from '@app/shared';
import { useChat } from '@/hooks/use-chat';
import { shortRevision } from '@/lib/repository-status';
import { MessageBubble } from './message-bubble';
import { QuestionForm } from './question-form';
import { StarterQuestions } from './starter-questions';

export function ChatPanel({
  repo,
  onSwitchRepo,
}: {
  repo: RepositorySummary;
  onSwitchRepo: () => void;
}) {
  const { messages, pending, ask } = useChat(repo.id);

  return (
    <div className="mx-auto flex h-screen max-w-3xl flex-col px-6 py-6">
      <header className="mb-4 flex items-baseline justify-between border-b border-border-subtle pb-4">
        <div>
          <h1 className="text-lg font-semibold">{repo.name}</h1>
          <p className="text-xs text-ink-muted">
            {repo.chunkCount} chunks &middot; {repo.fileCount} files &middot;{' '}
            {shortRevision(repo.revision)}
          </p>
        </div>
        <button
          type="button"
          onClick={onSwitchRepo}
          className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-accent hover:text-accent"
        >
          Switch repository
        </button>
      </header>

      {/*
        One live region for the whole conversation, rather than one per
        message: a screen reader announces an answer as it arrives without
        stealing focus from the input. tabIndex makes the transcript
        scrollable by keyboard, which an overflow container is not by default.
      */}
      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={pending}
        aria-label={`Conversation about ${repo.name}`}
        tabIndex={0}
        className="flex-1 space-y-6 overflow-y-auto pb-4"
      >
        {messages.length === 0 && <StarterQuestions onPick={(q) => void ask(q)} />}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} repositoryId={repo.id} />
        ))}
      </div>

      <QuestionForm onAsk={(q) => void ask(q)} disabled={pending} />
    </div>
  );
}
