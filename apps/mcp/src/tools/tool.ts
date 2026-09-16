import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z, ZodRawShape } from 'zod';
import type { RepositoryApi } from '../api-client.js';
import type { WaitOptions } from '../wait-for-indexing.js';

/** What every tool handler gets: the API, and how to wait for indexing. */
export interface ToolContext {
  api: RepositoryApi;
  indexing: WaitOptions;
}

export interface ToolDefinition<Shape extends ZodRawShape = ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
  annotations: ToolAnnotations;
  /**
   * Returns the text the model reads. Throwing is fine - see toErrorResult.
   * Declared as a method (not a function property) so a tool with a specific
   * input shape is still assignable to ToolDefinition<ZodRawShape>.
   */
  handler(args: z.infer<z.ZodObject<Shape>>, context: ToolContext): Promise<string>;
}

/** Preserves the input-schema type so the handler's `args` are fully typed. */
export function defineTool<Shape extends ZodRawShape>(
  tool: ToolDefinition<Shape>,
): ToolDefinition<Shape> {
  return tool;
}

export function toTextResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }] };
}

/**
 * Tool failures are reported *to the model* (isError), not as protocol
 * errors, so it can read the message and recover - start the API, fix the
 * repository name, wait for indexing.
 */
export function toErrorResult(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text', text: message }], isError: true };
}
