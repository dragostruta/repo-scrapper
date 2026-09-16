import { askRepositoryTool } from './ask-repository.tool.js';
import { getCodeExcerptTool } from './get-code-excerpt.tool.js';
import { indexRepositoryTool } from './index-repository.tool.js';
import { listRepositoriesTool } from './list-repositories.tool.js';
import { searchCodeTool } from './search-code.tool.js';
import type { ToolDefinition } from './tool.js';

/** Every tool the server exposes. Adding a tool means adding it here - server.ts doesn't change. */
export const TOOLS: readonly ToolDefinition[] = [
  listRepositoriesTool,
  indexRepositoryTool,
  searchCodeTool,
  askRepositoryTool,
  getCodeExcerptTool,
];
