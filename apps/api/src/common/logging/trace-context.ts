import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface TraceStore {
  traceId: string;
}

/**
 * One trace id follows a request from HTTP boundary through ingest, chunking,
 * embedding, retrieval and generation. Passing it explicitly through every
 * layer would be noise; AsyncLocalStorage keeps the plumbing invisible while
 * still making every log line correlatable.
 */
export const traceStorage = new AsyncLocalStorage<TraceStore>();

export function currentTraceId(): string | undefined {
  return traceStorage.getStore()?.traceId;
}

export function runWithTrace<T>(traceId: string, fn: () => T): T {
  return traceStorage.run({ traceId }, fn);
}

export function newTraceId(): string {
  return randomUUID();
}
