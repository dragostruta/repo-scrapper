'use client';

import type { Citation } from '@app/shared';
import { useChunkExcerpt } from '@/hooks/use-chunk-excerpt';

export function citationLabel(citation: Citation): string {
  const symbol = citation.symbol ? ` (${citation.symbol})` : '';
  return `${citation.path}:${citation.startLine}-${citation.endLine}${symbol}`;
}

/** A citation badge that expands in place to show the code it cites. */
export function CitationChip({
  repositoryId,
  citation,
}: {
  repositoryId: string;
  citation: Citation;
}) {
  const { expanded, excerpt, loading, error, toggle } = useChunkExcerpt(
    repositoryId,
    citation.chunkId,
  );

  return (
    <div className="inline-block max-w-full align-top">
      <button
        type="button"
        onClick={toggle}
        title={`score ${citation.score.toFixed(2)} - click to see the code`}
        aria-expanded={expanded}
        className="rounded-full border border-[var(--color-border-subtle)] px-2 py-0.5 text-xs text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >
        {citationLabel(citation)}
      </button>

      {expanded && (
        <div className="mt-2 w-full max-w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3">
          {loading && (
            <p className="text-xs text-[var(--color-ink-muted)]">Loading excerpt&hellip;</p>
          )}
          {error && (
            <p role="alert" className="text-xs text-rose-400">
              {error}
            </p>
          )}
          {excerpt && (
            <pre className="overflow-x-auto text-xs leading-relaxed">
              <code>{excerpt.content}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
