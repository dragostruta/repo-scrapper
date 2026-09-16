import { act, renderHook } from '@testing-library/react';
import type { RepositorySummary } from '@app/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { aRepository } from '@/test/builders';
import { POLL_INTERVAL_MS, useRepositoryIndexing } from './use-repository-indexing';

describe('useRepositoryIndexing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(api, 'createRepository');
    vi.spyOn(api, 'getRepository');
  });

  afterEach(() => vi.useRealTimers());

  const advancePoll = () => act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS));

  it('calls onIndexed straight away for a cache hit', async () => {
    const indexed = aRepository({ status: 'INDEXED' });
    vi.mocked(api.createRepository).mockResolvedValue(indexed);
    const onIndexed = vi.fn();
    const { result } = renderHook(() => useRepositoryIndexing(onIndexed));

    await act(() => result.current.submit(' https://github.com/acme/widgets '));

    expect(api.createRepository).toHaveBeenCalledWith('https://github.com/acme/widgets');
    expect(onIndexed).toHaveBeenCalledWith(indexed);
    expect(api.getRepository).not.toHaveBeenCalled();
  });

  it('polls until the repository is indexed, then stops', async () => {
    vi.mocked(api.createRepository).mockResolvedValue(aRepository({ status: 'CLONING' }));
    vi.mocked(api.getRepository)
      .mockResolvedValueOnce(aRepository({ status: 'INDEXING' }))
      .mockResolvedValueOnce(aRepository({ status: 'INDEXED' }));
    const onIndexed = vi.fn();
    const { result } = renderHook(() => useRepositoryIndexing(onIndexed));

    await act(() => result.current.submit('https://github.com/acme/widgets'));
    expect(result.current.busy).toBe(true);

    await advancePoll();
    expect(result.current.repository?.status).toBe('INDEXING');
    expect(onIndexed).not.toHaveBeenCalled();

    await advancePoll();
    expect(onIndexed).toHaveBeenCalledTimes(1);

    await advancePoll();
    expect(api.getRepository).toHaveBeenCalledTimes(2);
  });

  it('stops polling and unlocks the form when indexing fails', async () => {
    vi.mocked(api.createRepository).mockResolvedValue(aRepository({ status: 'CLONING' }));
    vi.mocked(api.getRepository).mockResolvedValue(
      aRepository({ status: 'FAILED', error: 'Could not clone.' }),
    );
    const { result } = renderHook(() => useRepositoryIndexing(vi.fn()));

    await act(() => result.current.submit('https://github.com/acme/widgets'));
    await advancePoll();
    await advancePoll();

    expect(result.current.repository).toMatchObject({
      status: 'FAILED',
      error: 'Could not clone.',
    });
    expect(result.current.busy).toBe(false);
    expect(api.getRepository).toHaveBeenCalledTimes(1);
  });

  it('shows the API message when the URL is rejected', async () => {
    vi.mocked(api.createRepository).mockRejectedValue(
      new api.ApiError('Only https:// repository URLs are accepted.', 400),
    );
    const { result } = renderHook(() => useRepositoryIndexing(vi.fn()));

    await act(() => result.current.submit('http://github.com/a/b'));

    expect(result.current.error).toBe('Only https:// repository URLs are accepted.');
    expect(result.current.busy).toBe(false);
    expect(result.current.submitting).toBe(false);
  });

  it('explains a lost connection while polling', async () => {
    vi.mocked(api.createRepository).mockResolvedValue(aRepository({ status: 'CLONING' }));
    vi.mocked(api.getRepository).mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useRepositoryIndexing(vi.fn()));

    await act(() => result.current.submit('https://github.com/acme/widgets'));
    await advancePoll();

    expect(result.current.error).toBe('Lost connection to the API while indexing.');
  });

  it('resumes polling a repository that was still indexing', async () => {
    vi.mocked(api.getRepository).mockResolvedValue(aRepository({ status: 'INDEXED' }));
    const onIndexed = vi.fn();

    renderHook(() => useRepositoryIndexing(onIndexed, aRepository({ status: 'INDEXING' })));
    await advancePoll();

    expect(onIndexed).toHaveBeenCalledTimes(1);
  });

  it('does not poll a resumed repository that already failed', async () => {
    const { result } = renderHook(() =>
      useRepositoryIndexing(vi.fn(), aRepository({ status: 'FAILED' })),
    );
    await advancePoll();
    expect(api.getRepository).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('ignores a blank URL', async () => {
    const { result } = renderHook(() => useRepositoryIndexing(vi.fn()));
    await act(() => result.current.submit('   '));
    expect(api.createRepository).not.toHaveBeenCalled();
  });

  it('keeps one poll running when the onIndexed callback changes identity', async () => {
    vi.mocked(api.createRepository).mockResolvedValue(aRepository({ status: 'CLONING' }));
    vi.mocked(api.getRepository).mockResolvedValue(aRepository({ status: 'INDEXING' }));
    const { result, rerender } = renderHook(
      ({ cb }: { cb: (repository: RepositorySummary) => void }) => useRepositoryIndexing(cb),
      {
        initialProps: { cb: vi.fn() },
      },
    );

    await act(() => result.current.submit('https://github.com/acme/widgets'));
    // Re-render part-way through the interval. If a new callback identity
    // restarted the interval, the poll would slip past the 2s mark.
    await act(() => vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 500));
    rerender({ cb: vi.fn() });
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(api.getRepository).toHaveBeenCalledTimes(1);
  });

  it('stops polling on unmount', async () => {
    vi.mocked(api.createRepository).mockResolvedValue(aRepository({ status: 'CLONING' }));
    const { result, unmount } = renderHook(() => useRepositoryIndexing(vi.fn()));

    await act(() => result.current.submit('https://github.com/acme/widgets'));
    unmount();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

    expect(api.getRepository).not.toHaveBeenCalled();
  });
});
