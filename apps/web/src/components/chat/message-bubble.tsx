import type { ChatMessage } from '@/lib/chat-history';
import { CitationChip } from './citation-chip';
import { MarkdownAnswer } from './markdown-answer';

export function MessageBubble({
  message,
  repositoryId,
}: {
  message: ChatMessage;
  repositoryId: string;
}) {
  return (
    <article className="space-y-2">
      <p className="text-sm font-medium">{message.question}</p>

      {message.pending && (
        <p className="text-sm text-[var(--color-ink-muted)]" aria-live="polite">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
          Thinking&hellip;
        </p>
      )}

      {message.error && (
        <p role="alert" className="text-sm text-rose-400">
          {message.error}
        </p>
      )}

      {message.answer && (
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4">
          <MarkdownAnswer text={message.answer} />

          {message.citations && message.citations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[var(--color-border-subtle)] pt-3">
              {message.citations.map((citation) => (
                <CitationChip
                  key={citation.chunkId}
                  repositoryId={repositoryId}
                  citation={citation}
                />
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
    </article>
  );
}
