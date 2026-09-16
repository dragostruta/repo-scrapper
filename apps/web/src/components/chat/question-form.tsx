'use client';

import { useState } from 'react';

export function QuestionForm({
  onAsk,
  disabled,
}: {
  onAsk: (question: string) => void;
  disabled: boolean;
}) {
  const [question, setQuestion] = useState('');
  const canSubmit = !disabled && question.trim().length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onAsk(question);
    setQuestion('');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 border-t border-[var(--color-border-subtle)] pt-4"
    >
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="How does authentication work in this repo?"
        aria-label="Question"
        className="flex-1 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)]"
      />
      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[#0b0d10] disabled:opacity-50"
      >
        Ask
      </button>
    </form>
  );
}
