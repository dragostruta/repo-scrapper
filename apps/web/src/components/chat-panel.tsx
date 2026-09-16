'use client';

import { useState } from 'react';
import type { AskResponse, Citation, RepositorySummary } from '@app/shared';
import { ApiError, askRepository } from '@/lib/api';

interface Message {
  id: string;
  question: string;
  answer?: string;
  citations?: Citation[];
  timings?: AskResponse['timings'];
  error?: string;
  pending: boolean;
}

export function ChatPanel({ repo }: { repo: RepositorySummary }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;

    const id = crypto.randomUUID();
    setMessages((prev) => [...prev, { id, question: trimmed, pending: true }]);
    setQuestion('');

    try {
      const response = await askRepository(repo.id, trimmed);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, pending: false, answer: response.answer, citations: response.citations, timings: response.timings }
            : m,
        ),
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, pending: false, error: err instanceof ApiError ? err.message : 'Request failed.' }
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
            {repo.chunkCount} chunks &middot; {repo.fileCount} files &middot; {repo.revision.slice(0, 7)}
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--color-ink-muted)]">
            Ask how something works, where a piece of functionality lives, or what an endpoint
            does. Answers are grounded in this repository only.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-[var(--color-border-subtle)] pt-4">
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

function MessageBubble({ message }: { message: Message }) {
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
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.answer}</p>

          {message.citations && message.citations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--color-border-subtle)] pt-3">
              {message.citations.map((c, i) => (
                <span
                  key={i}
                  title={`score ${c.score.toFixed(2)}`}
                  className="rounded-full border border-[var(--color-border-subtle)] px-2 py-0.5 text-xs text-[var(--color-ink-muted)]"
                >
                  {c.path}:{c.startLine}-{c.endLine}
                  {c.symbol ? ` (${c.symbol})` : ''}
                </span>
              ))}
            </div>
          )}

          {message.timings && (
            <p className="mt-2 text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">
              {message.timings.total}ms total &middot; {message.timings.retrieve}ms retrieve &middot;{' '}
              {message.timings.generate}ms generate
            </p>
          )}
        </div>
      )}
    </div>
  );
}
