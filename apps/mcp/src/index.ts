#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ApiClient } from './api-client.js';
import { readConfig } from './config.js';
import { createServer } from './server.js';

/**
 * stdio entry point. stdout carries the MCP protocol, so every diagnostic
 * goes to stderr - a stray console.log here would corrupt the session.
 */
async function main(): Promise<void> {
  const config = readConfig();
  const api = new ApiClient(config.apiUrl, { timeoutMs: config.requestTimeoutMs });
  const server = createServer({
    api,
    indexing: { intervalMs: config.pollIntervalMs, timeoutMs: config.indexTimeoutMs },
  });

  await server.connect(new StdioServerTransport());
  console.error(`repo-scrapper MCP server ready (API: ${config.apiUrl})`);
}

main().catch((err: unknown) => {
  console.error(
    `repo-scrapper MCP server failed to start: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
