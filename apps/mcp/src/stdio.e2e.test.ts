import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aRepository, aSearchHit } from './test/builders.js';

const SERVER_ENTRY = fileURLToPath(new URL('../dist/index.js', import.meta.url));

/** A stand-in for the real API: just enough routes for the tools under test. */
function startFakeApi(): Promise<Server> {
  const server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/repositories') return send(200, [aRepository()]);
    if (req.method === 'POST' && req.url === '/repositories/repo-1/search') {
      return send(200, { results: [aSearchHit()], timings: { embedQuestion: 1, retrieve: 1 } });
    }
    return send(404, { statusCode: 404, message: `No route ${req.method} ${req.url}` });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * The built server, spawned exactly as Claude Code runs it (`node dist/index.js`
 * over stdio), against a fake HTTP API. Proves the entry point wires config,
 * client and transport together and never writes non-protocol output to stdout.
 */
describe('stdio server (built binary)', () => {
  let api: Server;
  let client: Client;
  const stderr: string[] = [];

  beforeAll(async () => {
    api = await startFakeApi();
    const { port } = api.address() as AddressInfo;
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [SERVER_ENTRY],
      env: { ...process.env, REPO_SCRAPPER_API_URL: `http://127.0.0.1:${port}` } as Record<
        string,
        string
      >,
      stderr: 'pipe',
    });
    transport.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()));
    client = new Client({ name: 'stdio-e2e', version: '1.0.0' });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
    await new Promise((resolve) => api?.close(resolve));
  });

  it('completes the MCP handshake and lists tools', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(5);
  });

  it('calls through to the API over HTTP', async () => {
    const result = await client.callTool({
      name: 'search_code',
      arguments: { repository: 'acme/widgets', query: 'login' },
    });
    const text = (result.content as { text: string }[])[0]!.text;
    expect(text).toContain('## [1] src/auth.ts:10-20 (login)');
  });

  it('logs readiness to stderr, not stdout', () => {
    expect(stderr.join('')).toContain('repo-scrapper MCP server ready');
  });
});
