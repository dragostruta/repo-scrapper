'use client';

import { useState } from 'react';
import type { ChunkExcerpt, Citation } from '@app/shared';
import { ApiError, getChunkExcerpt } from '@/lib/api';

/** A clickable citation badge that expands in place to show the actual code
 * excerpt it cites, fetched on demand (not sent with every answer - see the
 * comment on ChunkExcerpt in @app/shared). */
export function CitationChip({
  repositoryId,
  citation,
}: {
  repositoryId: string;
  citation: Citation;
}) {
  const [expanded, setExpanded] = useState(false);
  const [excerpt, setExcerpt] = useState<ChunkExcerpt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (excerpt || loading) return;

    setLoading(true);
    setError(null);
    try {
      const result = await getChunkExcerpt(repositoryId, citation.chunkId);
      setExcerpt(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load this excerpt.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-block align-top">
      <button
        type="button"
        onClick={toggle}
        title={`score ${citation.score.toFixed(2)} - click to see the code`}
        aria-expanded={expanded}
        className="rounded-full border border-[var(--color-border-subtle)] px-2 py-0.5 text-xs text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      >
        {citation.path}:{citation.startLine}-{citation.endLine}
        {citation.symbol ? ` (${citation.symbol})` : ''}
      </button>

      {expanded && (
        <div className="mt-2 w-full max-w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-3">
          {loading && (
            <p className="text-xs text-[var(--color-ink-muted)]">Loading excerpt&hellip;</p>
          )}
          {error && <p className="text-xs text-rose-400">{error}</p>}
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
