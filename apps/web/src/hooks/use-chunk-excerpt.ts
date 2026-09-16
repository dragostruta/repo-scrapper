'use client';

import { useCallback, useState } from 'react';
import type { ChunkExcerpt } from '@app/shared';
import { describeError, getChunkExcerpt } from '@/lib/api';

export interface ChunkExcerptState {
  expanded: boolean;
  excerpt: ChunkExcerpt | null;
  loading: boolean;
  error: string | null;
  toggle: () => void;
}

/** Expand/collapse one citation, fetching its code the first time it opens. */
export function useChunkExcerpt(repositoryId: string, chunkId: string): ChunkExcerptState {
  const [expanded, setExpanded] = useState(false);
  const [excerpt, setExcerpt] = useState<ChunkExcerpt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setExcerpt(await getChunkExcerpt(repositoryId, chunkId));
    } catch (err) {
      setError(describeError(err, 'Could not load this excerpt.'));
    } finally {
      setLoading(false);
    }
  }, [repositoryId, chunkId]);

  const toggle = useCallback(() => {
    const opening = !expanded;
    setExpanded(opening);
    if (opening && !excerpt && !loading) void load();
  }, [expanded, excerpt, loading, load]);

  return { expanded, excerpt, loading, error, toggle };
}
