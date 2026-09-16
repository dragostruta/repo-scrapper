import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { aRepository } from '@/test/builders';
import { ACTIVE_REPOSITORY_KEY, useActiveRepository } from './use-active-repository';

describe('useActiveRepository', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getRepository');
  });

  it('finishes restoring immediately when nothing is remembered', async () => {
    const { result } = renderHook(() => useActiveRepository());
    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(result.current.active).toBeNull();
    expect(api.getRepository).not.toHaveBeenCalled();
  });

  it('restores a remembered, indexed repository as active', async () => {
    window.localStorage.setItem(ACTIVE_REPOSITORY_KEY, 'repo-1');
    vi.mocked(api.getRepository).mockResolvedValue(aRepository({ id: 'repo-1' }));

    const { result } = renderHook(() => useActiveRepository());

    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(result.current.active?.id).toBe('repo-1');
    expect(result.current.resumable).toBeNull();
  });

  it('hands a still-indexing repository to intake to resume', async () => {
    window.localStorage.setItem(ACTIVE_REPOSITORY_KEY, 'repo-1');
    vi.mocked(api.getRepository).mockResolvedValue(aRepository({ status: 'INDEXING' }));

    const { result } = renderHook(() => useActiveRepository());

    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(result.current.active).toBeNull();
    expect(result.current.resumable?.status).toBe('INDEXING');
  });

  it('forgets a remembered repository that no longer exists', async () => {
    window.localStorage.setItem(ACTIVE_REPOSITORY_KEY, 'deleted');
    vi.mocked(api.getRepository).mockRejectedValue(new api.ApiError('not found', 404));

    const { result } = renderHook(() => useActiveRepository());

    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(result.current.active).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_REPOSITORY_KEY)).toBeNull();
  });

  it('select remembers the repository; clear forgets it', async () => {
    const { result } = renderHook(() => useActiveRepository());
    await waitFor(() => expect(result.current.restoring).toBe(false));

    act(() => result.current.select(aRepository({ id: 'repo-9' })));
    expect(result.current.active?.id).toBe('repo-9');
    expect(window.localStorage.getItem(ACTIVE_REPOSITORY_KEY)).toBe('repo-9');

    act(() => result.current.clear());
    expect(result.current.active).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_REPOSITORY_KEY)).toBeNull();
  });
});
