import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../api-client.js';
import { aRepository, fakeApi } from '../test/builders.js';
import { askRepositoryTool } from './ask-repository.tool.js';
import { getCodeExcerptTool } from './get-code-excerpt.tool.js';
import { indexRepositoryTool } from './index-repository.tool.js';
import { listRepositoriesTool } from './list-repositories.tool.js';
import { searchCodeTool } from './search-code.tool.js';
import type { ToolContext } from './tool.js';

function context(api = fakeApi()): ToolContext & { api: ReturnType<typeof fakeApi> } {
  return { api, indexing: { intervalMs: 1, timeoutMs: 50, sleep: async () => undefined } };
}

describe('list_repositories', () => {
  it('lists repositories', async () => {
    expect(await listRepositoriesTool.handler({}, context())).toContain('acme/widgets [INDEXED]');
  });
});

describe('index_repository', () => {
  it('returns immediately when asked not to wait', async () => {
    const ctx = context();
    const text = await indexRepositoryTool.handler(
      { url: 'https://github.com/acme/widgets', wait: false },
      ctx,
    );
    expect(text).toBe('Indexing started: acme/widgets [CLONING] id=repo-1');
    expect(ctx.api.createRepository).toHaveBeenCalledWith('https://github.com/acme/widgets');
    expect(ctx.api.getRepository).not.toHaveBeenCalled();
  });

  it('waits and reports the ready repository', async () => {
    const ctx = context();
    ctx.api.getRepository.mockResolvedValue(aRepository({ status: 'INDEXED' }));
    const text = await indexRepositoryTool.handler(
      { url: 'https://github.com/acme/widgets', wait: true },
      ctx,
    );
    expect(text).toMatch(/^Ready: acme\/widgets \[INDEXED\]/);
  });

  it('returns a cache hit without polling', async () => {
    const ctx = context();
    ctx.api.createRepository.mockResolvedValue(aRepository({ status: 'INDEXED' }));
    expect(
      await indexRepositoryTool.handler({ url: 'https://github.com/a/b', wait: true }, ctx),
    ).toMatch(/^Ready:/);
    expect(ctx.api.getRepository).not.toHaveBeenCalled();
  });

  it('throws with the failure reason when indexing fails', async () => {
    const ctx = context();
    ctx.api.getRepository.mockResolvedValue(
      aRepository({ status: 'FAILED', error: 'acme/widgets is 900MB, over the 200MB limit.' }),
    );
    await expect(
      indexRepositoryTool.handler({ url: 'https://github.com/acme/widgets', wait: true }, ctx),
    ).rejects.toThrow(/Indexing failed: .*over the 200MB limit/);
  });

  it('reports a timeout without failing, so the model can check back', async () => {
    const ctx = context();
    ctx.api.getRepository.mockResolvedValue(aRepository({ status: 'INDEXING' }));
    const text = await indexRepositoryTool.handler(
      { url: 'https://github.com/acme/widgets', wait: true },
      ctx,
    );
    expect(text).toMatch(/^Still indexing after 0s: .*list_repositories/);
  });

  it('passes the API’s rejection through', async () => {
    const ctx = context();
    ctx.api.createRepository.mockRejectedValue(
      new ApiRequestError('"gitlab.com" is not an allowed repository host.', 400),
    );
    await expect(
      indexRepositoryTool.handler({ url: 'https://gitlab.com/a/b', wait: true }, ctx),
    ).rejects.toThrow('not an allowed repository host');
  });
});

describe('search_code', () => {
  it('resolves the repository by name and returns ranked code', async () => {
    const ctx = context();
    const text = await searchCodeTool.handler(
      { repository: 'acme/widgets', query: 'password hashing', limit: 3 },
      ctx,
    );
    expect(ctx.api.search).toHaveBeenCalledWith('repo-1', 'password hashing', 3);
    expect(text).toContain('```typescript\nexport function login() {}');
  });

  it('reports an unknown repository in a way the model can act on', async () => {
    await expect(
      searchCodeTool.handler({ repository: 'nope/nope', query: 'q' }, context()),
    ).rejects.toThrow(/list_repositories/);
  });
});

describe('ask_repository', () => {
  it('asks the resolved repository and returns the answer with sources', async () => {
    const ctx = context();
    const text = await askRepositoryTool.handler(
      { repository: 'repo-1', question: 'How does login work?' },
      ctx,
    );
    expect(ctx.api.ask).toHaveBeenCalledWith('repo-1', 'How does login work?');
    expect(text).toContain('Login hashes the password.');
    expect(text).toContain('Sources retrieved:');
  });

  it('passes through a not-ready error from the API', async () => {
    const ctx = context();
    ctx.api.ask.mockRejectedValue(
      new ApiRequestError('Repository is indexing, not ready to answer questions yet.', 409),
    );
    await expect(
      askRepositoryTool.handler({ repository: 'repo-1', question: 'q' }, ctx),
    ).rejects.toThrow(/not ready/);
  });
});

describe('get_code_excerpt', () => {
  it('returns the chunk’s code', async () => {
    const ctx = context();
    const text = await getCodeExcerptTool.handler(
      { repository: 'acme/widgets', chunkId: 'chunk-1' },
      ctx,
    );
    expect(ctx.api.getChunkExcerpt).toHaveBeenCalledWith('repo-1', 'chunk-1');
    expect(text).toContain('src/auth.ts:10-20 (login)');
  });
});
