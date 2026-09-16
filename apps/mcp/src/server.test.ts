import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiRequestError } from './api-client.js';
import { createServer, SERVER_INSTRUCTIONS, SERVER_NAME } from './server.js';
import { fakeApi } from './test/builders.js';

/** A real MCP client talking to the server over an in-memory transport - the full protocol, no process. */
async function connect(api = fakeApi()) {
  const server = createServer({
    api,
    indexing: { intervalMs: 1, timeoutMs: 20, sleep: async () => undefined },
  });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server, api };
}

const textOf = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.content as { type: string; text: string }[]).map((c) => c.text).join('\n');

describe('MCP server over the protocol', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  it('identifies itself and explains how to use its tools', async () => {
    const { client, server } = await connect();
    close = () => server.close();
    expect(client.getServerVersion()?.name).toBe(SERVER_NAME);
    expect(client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
  });

  it('lists all five tools with input schemas and read-only hints', async () => {
    const { client, server } = await connect();
    close = () => server.close();

    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      'ask_repository',
      'get_code_excerpt',
      'index_repository',
      'list_repositories',
      'search_code',
    ]);
    const search = tools.find((t) => t.name === 'search_code')!;
    expect(search.inputSchema.required).toEqual(['repository', 'query']);
    expect(search.inputSchema.properties).toHaveProperty('limit');
    expect(search.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'index_repository')!.annotations?.readOnlyHint).toBe(false);
  });

  it('runs a tool and returns its text', async () => {
    const { client, server, api } = await connect();
    close = () => server.close();

    const result = await client.callTool({
      name: 'search_code',
      arguments: { repository: 'acme/widgets', query: 'login' },
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toContain('src/auth.ts:10-20 (login)');
    expect(api.search).toHaveBeenCalledWith('repo-1', 'login', undefined);
  });

  it('applies schema defaults (index_repository waits unless told not to)', async () => {
    const { client, server, api } = await connect();
    close = () => server.close();
    api.createRepository.mockResolvedValue({
      ...(await api.listRepositories())[0]!,
      status: 'INDEXED',
    });

    const result = await client.callTool({
      name: 'index_repository',
      arguments: { url: 'https://github.com/acme/widgets' },
    });

    expect(textOf(result)).toMatch(/^Ready:/);
  });

  it('reports a failing API call as a tool error the model can read', async () => {
    const api = fakeApi();
    api.listRepositories.mockRejectedValue(
      new ApiRequestError('Could not reach the API at http://localhost:3001.', null),
    );
    const { client, server } = await connect(api);
    close = () => server.close();

    const result = await client.callTool({ name: 'list_repositories', arguments: {} });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('Could not reach the API at http://localhost:3001.');
  });

  it('rejects arguments that break the input schema before the handler runs', async () => {
    const { client, server, api } = await connect();
    close = () => server.close();

    const result = await client.callTool({
      name: 'search_code',
      arguments: { repository: 'acme/widgets', query: 'q', limit: 500 },
    });

    expect(result.isError).toBe(true);
    expect(api.search).not.toHaveBeenCalled();
  });
});
