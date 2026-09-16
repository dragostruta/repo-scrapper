import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { useChunkExcerpt } from './use-chunk-excerpt';

const EXCERPT = {
  path: 'src/auth.ts',
  startLine: 1,
  endLine: 3,
  symbol: 'login',
  language: 'typescript',
  content: 'export function login() {}',
};

describe('useChunkExcerpt', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getChunkExcerpt').mockResolvedValue(EXCERPT);
  });

  it('fetches the excerpt the first time it opens', async () => {
    const { result } = renderHook(() => useChunkExcerpt('repo-1', 'chunk-1'));

    await act(async () => result.current.toggle());

    expect(result.current.expanded).toBe(true);
    expect(result.current.excerpt).toEqual(EXCERPT);
    expect(api.getChunkExcerpt).toHaveBeenCalledWith('repo-1', 'chunk-1');
  });

  it('reuses the loaded excerpt when reopened', async () => {
    const { result } = renderHook(() => useChunkExcerpt('repo-1', 'chunk-1'));

    await act(async () => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.expanded).toBe(false);
    await act(async () => result.current.toggle());

    expect(api.getChunkExcerpt).toHaveBeenCalledTimes(1);
    expect(result.current.excerpt).toEqual(EXCERPT);
  });

  it('shows an error and allows a retry after closing and reopening', async () => {
    vi.mocked(api.getChunkExcerpt).mockRejectedValueOnce(new api.ApiError('Chunk not found', 404));
    const { result } = renderHook(() => useChunkExcerpt('repo-1', 'chunk-1'));

    await act(async () => result.current.toggle());
    expect(result.current.error).toBe('Chunk not found');
    expect(result.current.loading).toBe(false);

    act(() => result.current.toggle());
    await act(async () => result.current.toggle());
    expect(result.current.error).toBeNull();
    expect(result.current.excerpt).toEqual(EXCERPT);
  });

  it('uses a generic message for a network failure', async () => {
    vi.mocked(api.getChunkExcerpt).mockRejectedValueOnce(new TypeError('offline'));
    const { result } = renderHook(() => useChunkExcerpt('repo-1', 'chunk-1'));
    await act(async () => result.current.toggle());
    expect(result.current.error).toBe('Could not load this excerpt.');
  });
});
