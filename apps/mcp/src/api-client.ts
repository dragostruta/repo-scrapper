import type { AskResponse, ChunkExcerpt, RepositorySummary, SearchResponse } from '@app/shared';

/** A failed API call, with a message fit to show an MCP client as-is. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    /** HTTP status, or null when the API could not be reached at all. */
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** Everything the tools need from the API - tools depend on this, not on HTTP. */
export interface RepositoryApi {
  listRepositories(): Promise<RepositorySummary[]>;
  getRepository(id: string): Promise<RepositorySummary>;
  createRepository(url: string): Promise<RepositorySummary>;
  ask(repositoryId: string, question: string): Promise<AskResponse>;
  search(repositoryId: string, query: string, limit?: number): Promise<SearchResponse>;
  getChunkExcerpt(repositoryId: string, chunkId: string): Promise<ChunkExcerpt>;
}

export interface ApiClientOptions {
  timeoutMs: number;
  fetchFn?: typeof fetch;
}

/** Thin, typed HTTP client for the Code Documentation Assistant API. */
export class ApiClient implements RepositoryApi {
  private readonly fetchFn: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    private readonly options: ApiClientOptions,
  ) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  listRepositories(): Promise<RepositorySummary[]> {
    return this.request('/repositories');
  }

  getRepository(id: string): Promise<RepositorySummary> {
    return this.request(`/repositories/${encodeURIComponent(id)}`);
  }

  createRepository(url: string): Promise<RepositorySummary> {
    return this.request('/repositories', { method: 'POST', body: { url } });
  }

  ask(repositoryId: string, question: string): Promise<AskResponse> {
    return this.request(`/repositories/${encodeURIComponent(repositoryId)}/ask`, {
      method: 'POST',
      body: { question },
    });
  }

  search(repositoryId: string, query: string, limit?: number): Promise<SearchResponse> {
    return this.request(`/repositories/${encodeURIComponent(repositoryId)}/search`, {
      method: 'POST',
      body: limit === undefined ? { query } : { query, limit },
    });
  }

  getChunkExcerpt(repositoryId: string, chunkId: string): Promise<ChunkExcerpt> {
    return this.request(
      `/repositories/${encodeURIComponent(repositoryId)}/chunks/${encodeURIComponent(chunkId)}`,
    );
  }

  private async request<T>(
    path: string,
    { method = 'GET', body }: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const response = await this.send(path, method, body);
    if (!response.ok) throw await this.toError(response);
    return (await response.json()) as T;
  }

  private async send(path: string, method: string, body: unknown): Promise<Response> {
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (err) {
      throw this.toConnectionError(err);
    }
  }

  private toConnectionError(err: unknown): ApiRequestError {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return new ApiRequestError(
        `The API at ${this.baseUrl} did not respond within ${Math.round(this.options.timeoutMs / 1000)}s. ` +
          'A local LLM can be slow - raise REPO_SCRAPPER_REQUEST_TIMEOUT_MS if this keeps happening.',
        null,
      );
    }
    return new ApiRequestError(
      `Could not reach the Code Documentation Assistant API at ${this.baseUrl}. ` +
        'Is it running? Start it with `npm run setup -- ollama` (or `-- anthropic`).',
      null,
    );
  }

  private async toError(response: Response): Promise<ApiRequestError> {
    const body = (await response.json().catch(() => ({}))) as { message?: unknown };
    const message =
      typeof body.message === 'string' ? body.message : `API returned HTTP ${response.status}.`;
    return new ApiRequestError(message, response.status);
  }
}
