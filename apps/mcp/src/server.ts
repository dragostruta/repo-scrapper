import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './tools/index.js';
import {
  type ToolContext,
  type ToolDefinition,
  toErrorResult,
  toTextResult,
} from './tools/tool.js';

export const SERVER_NAME = 'repo-scrapper';
export const SERVER_VERSION = '0.1.0';

export const SERVER_INSTRUCTIONS = [
  'Gives access to GitHub repositories indexed by the Code Documentation Assistant.',
  'Typical flow: list_repositories -> (index_repository if missing) -> search_code to pull the',
  'relevant code into context -> get_code_excerpt for a specific chunk. ask_repository returns a',
  "ready-made answer from the assistant's own LLM when you just need a quick grounded summary.",
  'Repositories can be referred to by id or by "owner/name".',
].join(' ');

/** Runs a tool and turns both success and failure into a result the model can read. */
export async function runTool(
  tool: ToolDefinition,
  args: unknown,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    return toTextResult(await tool.handler(args as never, context));
  } catch (err) {
    return toErrorResult(err);
  }
}

export function createServer(
  context: ToolContext,
  tools: readonly ToolDefinition[] = TOOLS,
): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      (args: unknown) => runTool(tool, args, context),
    );
  }
  return server;
}
