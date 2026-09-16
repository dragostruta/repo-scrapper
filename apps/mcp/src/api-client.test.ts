import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiRequestError } from './api-client.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function client(response: Response | (() => Promise<Response>)) {
  const fetchFn = vi.fn<typeof fetch>(
    typeof response === 'function' ? response : async () => response,
  );
  return { api: new ApiClient('http://api.test', { timeoutMs: 5_000, fetchFn }), fetchFn };
}

describe('ApiClient', () => {
  it('GETs and parses a list', async () => {
    const { api, fetchFn } = client(json([{ id: 'r1' }]));
    expect(await api.listRepositories()).toEqual([{ id: 'r1' }]);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('http://api.test/repositories');
    expect(init).toMatchObject({ method: 'GET', body: undefined });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [
      'createRepository',
      (a: ApiClient) => a.createRepository('https://github.com/a/b'),
      '/repositories',
      { url: 'https://github.com/a/b' },
    ],
    [
      'ask',
      (a: ApiClient) => a.ask('r 1', 'why?'),
      '/repositories/r%201/ask',
      { question: 'why?' },
    ],
    [
      'search with a limit',
      (a: ApiClient) => a.search('r1', 'hash', 3),
      '/repositories/r1/search',
      { query: 'hash', limit: 3 },
    ],
    [
      'search without a limit',
      (a: ApiClient) => a.search('r1', 'hash'),
      '/repositories/r1/search',
      { query: 'hash' },
    ],
  ])('%s POSTs the expected body', async (_label, call, path, body) => {
    const { api, fetchFn } = client(json({}));
    await call(api);
    expect(fetchFn).toHaveBeenCalledWith(
      `http://api.test${path}`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }),
    );
  });

  it('encodes ids in GET paths', async () => {
    const { api, fetchFn } = client(async () => json({}));
    await api.getChunkExcerpt('repo/1', 'c#2');
    await api.getRepository('a?b');
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      'http://api.test/repositories/repo%2F1/chunks/c%232',
      'http://api.test/repositories/a%3Fb',
    ]);
  });

  it('surfaces the API’s own error message and status', async () => {
    const { api } = client(
      json({ statusCode: 409, message: 'Repository is indexing, not ready.' }, 409),
    );
    await expect(api.ask('r1', 'q')).rejects.toMatchObject({
      name: 'ApiRequestError',
      message: 'Repository is indexing, not ready.',
      status: 409,
    });
  });

  it('falls back to the status when the error body has no message', async () => {
    const { api } = client(new Response('Bad Gateway', { status: 502 }));
    await expect(api.listRepositories()).rejects.toMatchObject({
      message: 'API returned HTTP 502.',
      status: 502,
    });
  });

  it('explains how to start the API when it cannot be reached', async () => {
    const { api } = client(async () => {
      throw new TypeError('fetch failed');
    });
    const error = await api.listRepositories().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: null });
    expect((error as Error).message).toMatch(
      /Could not reach .* at http:\/\/api\.test.*npm run setup/,
    );
  });

  it('reports a timeout distinctly, with how to raise it', async () => {
    const { api } = client(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    await expect(api.ask('r1', 'q')).rejects.toThrow(
      /did not respond within 5s.*REPO_SCRAPPER_REQUEST_TIMEOUT_MS/,
    );
  });
});
