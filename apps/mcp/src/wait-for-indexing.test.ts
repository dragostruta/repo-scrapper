import { describe, expect, it, vi } from 'vitest';
import { aRepository, fakeApi } from './test/builders.js';
import { isSettled, waitForIndexing } from './wait-for-indexing.js';

/** A controllable clock: sleep() advances it instead of waiting. */
function clock() {
  let time = 0;
  return { now: () => time, sleep: vi.fn(async (ms: number) => void (time += ms)) };
}

describe('waitForIndexing', () => {
  it('returns immediately for a repository that is already settled', async () => {
    const api = fakeApi();
    const { now, sleep } = clock();

    const result = await waitForIndexing(api, aRepository({ status: 'INDEXED' }), {
      intervalMs: 10,
      timeoutMs: 100,
      now,
      sleep,
    });

    expect(result).toEqual({
      repository: expect.objectContaining({ status: 'INDEXED' }),
      timedOut: false,
    });
    expect(sleep).not.toHaveBeenCalled();
    expect(api.getRepository).not.toHaveBeenCalled();
  });

  it('polls until the repository is indexed', async () => {
    const api = fakeApi();
    api.getRepository
      .mockResolvedValueOnce(aRepository({ status: 'INDEXING' }))
      .mockResolvedValueOnce(aRepository({ status: 'INDEXED' }));
    const { now, sleep } = clock();

    const result = await waitForIndexing(api, aRepository({ status: 'CLONING' }), {
      intervalMs: 10,
      timeoutMs: 1_000,
      now,
      sleep,
    });

    expect(result.timedOut).toBe(false);
    expect(result.repository.status).toBe('INDEXED');
    expect(api.getRepository).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it('stops at FAILED', async () => {
    const api = fakeApi();
    api.getRepository.mockResolvedValue(
      aRepository({ status: 'FAILED', error: 'Could not clone.' }),
    );
    const { now, sleep } = clock();

    const result = await waitForIndexing(api, aRepository({ status: 'CLONING' }), {
      intervalMs: 10,
      timeoutMs: 1_000,
      now,
      sleep,
    });

    expect(result).toMatchObject({ timedOut: false, repository: { status: 'FAILED' } });
  });

  it('gives up at the timeout and says so', async () => {
    const api = fakeApi();
    api.getRepository.mockResolvedValue(aRepository({ status: 'INDEXING' }));
    const { now, sleep } = clock();

    const result = await waitForIndexing(api, aRepository({ status: 'CLONING' }), {
      intervalMs: 30,
      timeoutMs: 100,
      now,
      sleep,
    });

    expect(result).toMatchObject({ timedOut: true, repository: { status: 'INDEXING' } });
    expect(api.getRepository).toHaveBeenCalledTimes(4);
  });

  it('propagates an API failure while polling', async () => {
    const api = fakeApi();
    api.getRepository.mockRejectedValue(new Error('API down'));
    const { now, sleep } = clock();
    await expect(
      waitForIndexing(api, aRepository({ status: 'CLONING' }), {
        intervalMs: 1,
        timeoutMs: 10,
        now,
        sleep,
      }),
    ).rejects.toThrow('API down');
  });
});

describe('isSettled', () => {
  it.each([
    ['INDEXED', true],
    ['FAILED', true],
    ['PENDING', false],
    ['CLONING', false],
    ['INDEXING', false],
  ] as const)('%s -> %s', (status, settled) => {
    expect(isSettled(status)).toBe(settled);
  });
});
