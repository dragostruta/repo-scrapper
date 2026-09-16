import type { AskResponse, ChunkExcerpt, ConversationTurn, RepositorySummary } from '@app/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: { database: 'up' | 'down' };
  config: { llmProvider: string; embeddingModel: string };
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(body.message ?? `Request failed with ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

export function getHealth(): Promise<HealthResponse> {
  return request('/health', { cache: 'no-store' });
}

export function createRepository(url: string): Promise<RepositorySummary> {
  return request('/repositories', { method: 'POST', body: JSON.stringify({ url }) });
}

export function getRepository(id: string): Promise<RepositorySummary> {
  return request(`/repositories/${id}`, { cache: 'no-store' });
}

export function listRepositories(): Promise<RepositorySummary[]> {
  return request('/repositories', { cache: 'no-store' });
}

export function getChunkExcerpt(repositoryId: string, chunkId: string): Promise<ChunkExcerpt> {
  return request(`/repositories/${repositoryId}/chunks/${chunkId}`, { cache: 'no-store' });
}

export function askRepository(
  id: string,
  question: string,
  history: ConversationTurn[] = [],
): Promise<AskResponse> {
  return request(`/repositories/${id}/ask`, {
    method: 'POST',
    body: JSON.stringify(history.length > 0 ? { question, history } : { question }),
  });
}

export { ApiError };
