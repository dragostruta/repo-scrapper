import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { aRepository } from '@/test/builders';
import { useIndexedRepositories } from './use-indexed-repositories';

describe('useIndexedRepositories', () => {
  it('lists only repositories that are ready to chat with', async () => {
    vi.spyOn(api, 'listRepositories').mockResolvedValue([
      aRepository({ id: 'ready', status: 'INDEXED' }),
      aRepository({ id: 'busy', status: 'INDEXING' }),
      aRepository({ id: 'broken', status: 'FAILED' }),
    ]);

    const { result } = renderHook(() => useIndexedRepositories());

    await waitFor(() => expect(result.current.map((r) => r.id)).toEqual(['ready']));
  });

  it('stays empty when the list cannot be loaded', async () => {
    const list = vi.spyOn(api, 'listRepositories').mockRejectedValue(new TypeError('offline'));
    const { result } = renderHook(() => useIndexedRepositories());
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });

  it('ignores a response that arrives after unmount', async () => {
    let resolve!: (value: ReturnType<typeof aRepository>[]) => void;
    vi.spyOn(api, 'listRepositories').mockReturnValue(new Promise((r) => (resolve = r)));
    const errors = vi.spyOn(console, 'error');

    const { unmount } = renderHook(() => useIndexedRepositories());
    unmount();
    resolve([aRepository()]);
    await Promise.resolve();

    expect(errors).not.toHaveBeenCalled();
  });
});
