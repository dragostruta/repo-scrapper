import type { RepositoryStatus, RepositorySummary } from '@app/shared';
import type { RepositoryApi } from './api-client.js';

export interface WaitOptions {
  intervalMs: number;
  timeoutMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface WaitResult {
  repository: RepositorySummary;
  /** Gave up while the repository was still being cloned or indexed. */
  timedOut: boolean;
}

export function isSettled(status: RepositoryStatus): boolean {
  return status === 'INDEXED' || status === 'FAILED';
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls until the repository is INDEXED or FAILED, or the timeout passes. */
export async function waitForIndexing(
  api: RepositoryApi,
  repository: RepositorySummary,
  { intervalMs, timeoutMs, sleep = defaultSleep, now = Date.now }: WaitOptions,
): Promise<WaitResult> {
  const deadline = now() + timeoutMs;
  let current = repository;

  while (!isSettled(current.status) && now() < deadline) {
    await sleep(intervalMs);
    current = await api.getRepository(current.id);
  }
  return { repository: current, timedOut: !isSettled(current.status) };
}
