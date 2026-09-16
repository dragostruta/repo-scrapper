import type {
  AskResponse,
  ChunkExcerpt,
  ConversationTurn,
  HealthResponse,
  RepositorySummary,
} from '@app/shared';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** An error response from the API, carrying the API's own readable message. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The API's message for an ApiError, or `fallback` for anything else (e.g. a network failure). */
export function describeError(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return new ApiError(body.message ?? `Request failed with ${res.status}`, res.status);
}

export function getHealth(): Promise<HealthResponse> {
  return request('/health', { cache: 'no-store' });
}

export function createRepository(url: string): Promise<RepositorySummary> {
  return request('/repositories', { method: 'POST', body: JSON.stringify({ url }) });
}

export function getRepository(id: string): Promise<RepositorySummary> {
  return request(`/repositories/${encodeURIComponent(id)}`, { cache: 'no-store' });
}

export function listRepositories(): Promise<RepositorySummary[]> {
  return request('/repositories', { cache: 'no-store' });
}

export function getChunkExcerpt(repositoryId: string, chunkId: string): Promise<ChunkExcerpt> {
  return request(
    `/repositories/${encodeURIComponent(repositoryId)}/chunks/${encodeURIComponent(chunkId)}`,
    { cache: 'no-store' },
  );
}

export function askRepository(
  id: string,
  question: string,
  history: ConversationTurn[] = [],
): Promise<AskResponse> {
  return request(`/repositories/${encodeURIComponent(id)}/ask`, {
    method: 'POST',
    body: JSON.stringify(history.length > 0 ? { question, history } : { question }),
  });
}
