import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { anAskResponse, deferred } from '@/test/builders';
import { useChat } from './use-chat';

describe('useChat', () => {
  beforeEach(() => {
    vi.spyOn(api, 'askRepository').mockResolvedValue(anAskResponse());
  });

  it('adds a pending message, then fills in the answer', async () => {
    const request = deferred<ReturnType<typeof anAskResponse>>();
    vi.mocked(api.askRepository).mockReturnValue(request.promise);
    const { result } = renderHook(() => useChat('repo-1'));

    let asking!: Promise<void>;
    act(() => {
      asking = result.current.ask('  How does login work?  ');
    });
    expect(result.current.pending).toBe(true);
    expect(result.current.messages[0]).toMatchObject({
      question: 'How does login work?',
      pending: true,
    });

    await act(async () => {
      request.resolve(anAskResponse());
      await asking;
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.messages[0]).toMatchObject({
      pending: false,
      answer: 'Login hashes the password in `src/auth.ts`.',
      citations: [expect.objectContaining({ chunkId: 'chunk-1' })],
    });
    expect(api.askRepository).toHaveBeenCalledWith('repo-1', 'How does login work?', []);
  });

  it('sends earlier answered turns as history', async () => {
    const { result } = renderHook(() => useChat('repo-1'));
    await act(() => result.current.ask('first'));
    await act(() => result.current.ask('second'));

    expect(api.askRepository).toHaveBeenLastCalledWith('repo-1', 'second', [
      { question: 'first', answer: 'Login hashes the password in `src/auth.ts`.' },
    ]);
  });

  it('shows the API error on the message that failed', async () => {
    vi.mocked(api.askRepository).mockRejectedValue(
      new api.ApiError('Could not reach Ollama.', 503),
    );
    const { result } = renderHook(() => useChat('repo-1'));

    await act(() => result.current.ask('q'));

    expect(result.current.messages[0]).toMatchObject({
      pending: false,
      error: 'Could not reach Ollama.',
    });
  });

  it('shows a generic error for a network failure', async () => {
    vi.mocked(api.askRepository).mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useChat('repo-1'));
    await act(() => result.current.ask('q'));
    expect(result.current.messages[0].error).toBe('Request failed.');
  });

  it('does not send a failed turn as history', async () => {
    vi.mocked(api.askRepository).mockRejectedValueOnce(new TypeError('offline'));
    const { result } = renderHook(() => useChat('repo-1'));
    await act(() => result.current.ask('fails'));
    await act(() => result.current.ask('retry'));
    expect(api.askRepository).toHaveBeenLastCalledWith('repo-1', 'retry', []);
  });

  it('ignores blank questions', async () => {
    const { result } = renderHook(() => useChat('repo-1'));
    await act(() => result.current.ask('   '));
    expect(result.current.messages).toEqual([]);
    expect(api.askRepository).not.toHaveBeenCalled();
  });

  it('ignores a second question while one is still pending', async () => {
    vi.mocked(api.askRepository).mockReturnValue(deferred<never>().promise);
    const { result } = renderHook(() => useChat('repo-1'));

    act(() => {
      void result.current.ask('first');
      void result.current.ask('second');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(api.askRepository).toHaveBeenCalledTimes(1);
  });
});
