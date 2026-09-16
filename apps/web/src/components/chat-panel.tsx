'use client';

import { useState } from 'react';
import type { AskResponse, Citation, ConversationTurn, RepositorySummary } from '@app/shared';
import { ApiError, askRepository } from '@/lib/api';
import { MarkdownAnswer } from '@/components/markdown-answer';
import { CitationChip } from '@/components/citation-chip';

/** Shown on an empty chat so a new user has something to click instead of
 * facing a blank input - generic enough to make sense for almost any repo. */
const STARTER_QUESTIONS = [
  'What does this project do?',
  'What are the main dependencies?',
  'Where is the entry point / main function?',
  'What are the API endpoints, if any?',
];

interface Message {
  id: string;
  question: string;
  answer?: string;
  citations?: Citation[];
  timings?: AskResponse['timings'];
  error?: string;
  pending: boolean;
}

/** How many prior turns ride along with each new question, and how much of
 * each answer survives into that history - keeps follow-ups working without
 * letting a long chat balloon the prompt (D7: cheap by default). */
const HISTORY_TURNS = 4;
const HISTORY_ANSWER_CHARS = 600;

function toHistory(messages: Message[]): ConversationTurn[] {
  return messages
    .filter((m): m is Message & { answer: string } => !m.pending && !!m.answer)
    .slice(-HISTORY_TURNS)
    .map((m) => ({
      question: m.question,
      answer:
        m.answer.length > HISTORY_ANSWER_CHARS
          ? `${m.answer.slice(0, HISTORY_ANSWER_CHARS)}…`
          : m.answer,
    }));
}

export function ChatPanel({
  repo,
  onSwitchRepo,
}: {
  repo: RepositorySummary;
  onSwitchRepo: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await ask(question);
  }

  async function ask(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    const id = crypto.randomUUID();
    const history = toHistory(messages);
    setMessages((prev) => [...prev, { id, question: trimmed, pending: true }]);
    setQuestion('');

    try {
      const response = await askRepository(repo.id, trimmed, history);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                pending: false,
                answer: response.answer,
                citations: response.citations,
                timings: response.timings,
              }
            : m,
        ),
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                pending: false,
                error: err instanceof ApiError ? err.message : 'Request failed.',
              }
            : m,
        ),
      );
    }
  }

  return (
    <div className="mx-auto flex h-screen max-w-3xl flex-col px-6 py-6">
      <header className="mb-4 flex items-baseline justify-between border-b border-[var(--color-border-subtle)] pb-4">
        <div>
          <h1 className="text-lg font-semibold">{repo.name}</h1>
          <p className="text-xs text-[var(--color-ink-muted)]">
            {repo.chunkCount} chunks &middot; {repo.fileCount} files &middot;{' '}
            {repo.revision.slice(0, 7)}
          </p>
        </div>
        <button
          type="button"
          onClick={onSwitchRepo}
          className="rounded-lg border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          Switch repository
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-ink-muted)]">
              Ask how something works, where a piece of functionality lives, or what an endpoint
              does. Answers are grounded in this repository only.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void ask(q)}
                  className="rounded-full border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} repositoryId={repo.id} />
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-[var(--color-border-subtle)] pt-4"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="How does authentication work in this repo?"
          className="flex-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)]"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[#0b0d10]"
        >
          Ask
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message, repositoryId }: { message: Message; repositoryId: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{message.question}</p>

      {message.pending && (
        <p className="text-sm text-[var(--color-ink-muted)]">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
          Thinking&hellip;
        </p>
      )}

      {message.error && <p className="text-sm text-rose-400">{message.error}</p>}

      {message.answer && (
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4">
          <MarkdownAnswer text={message.answer} />

          {message.citations && message.citations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--color-border-subtle)] pt-3">
              {message.citations.map((c, i) => (
                <CitationChip key={i} repositoryId={repositoryId} citation={c} />
              ))}
            </div>
          )}

          {message.timings && (
            <p className="mt-2 text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">
              {message.timings.total}ms total &middot; {message.timings.retrieve}ms retrieve
              &middot; {message.timings.generate}ms generate
            </p>
          )}
        </div>
      )}
    </div>
  );
}
