import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  API_URL,
  ApiError,
  askRepository,
  createRepository,
  describeError,
  getChunkExcerpt,
  getHealth,
  getRepository,
  listRepositories,
} from './api';

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the parsed body of a successful response', async () => {
    const fetchMock = mockFetch(json([{ id: 'r1' }]));
    expect(await listRepositories()).toEqual([{ id: 'r1' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/repositories`,
      expect.objectContaining({
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('throws ApiError carrying the API’s message and status', async () => {
    mockFetch(json({ statusCode: 409, message: 'Repository is indexing' }, 409));
    const error = await getRepository('r1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: 'Repository is indexing', statusCode: 409 });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockFetch(new Response('<html>Bad Gateway</html>', { status: 502 }));
    await expect(getHealth()).rejects.toMatchObject({
      message: 'Request failed with 502',
      statusCode: 502,
    });
  });

  it('lets network failures through as-is (not an ApiError)', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const error = await listRepositories().catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it('POSTs the URL when creating a repository', async () => {
    const fetchMock = mockFetch(json({ id: 'r1' }, 201));
    await createRepository('https://github.com/a/b');
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/repositories`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://github.com/a/b' }),
      }),
    );
  });

  it('omits empty history from an ask request, and sends it when present', async () => {
    const fetchMock = mockFetch(json({ answer: 'a' }));
    await askRepository('r1', 'q');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ body: JSON.stringify({ question: 'q' }) });

    const history = [{ question: 'q0', answer: 'a0' }];
    const second = mockFetch(json({ answer: 'a' }));
    await askRepository('r1', 'q', history);
    expect(second.mock.calls[0][1]).toMatchObject({
      body: JSON.stringify({ question: 'q', history }),
    });
  });

  it('encodes ids into the path', async () => {
    const fetchMock = mockFetch(json({}));
    await getChunkExcerpt('repo/1', 'chunk?2');
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/repositories/repo%2F1/chunks/chunk%3F2`);
  });
});

describe('describeError', () => {
  it('uses an ApiError’s message', () => {
    expect(describeError(new ApiError('Nope', 400), 'fallback')).toBe('Nope');
  });

  it('uses the fallback for anything else', () => {
    expect(describeError(new TypeError('Failed to fetch'), 'Could not reach the API.')).toBe(
      'Could not reach the API.',
    );
    expect(describeError('weird', 'fallback')).toBe('fallback');
  });
});
