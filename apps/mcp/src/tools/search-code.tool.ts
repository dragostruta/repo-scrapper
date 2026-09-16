import { z } from 'zod';
import { formatSearchResults } from '../format.js';
import { resolveRepository } from '../repository-resolver.js';
import { repositoryArgument } from './ask-repository.tool.js';
import { defineTool } from './tool.js';

export const MAX_SEARCH_RESULTS = 20;

export const searchCodeTool = defineTool({
  name: 'search_code',
  title: 'Semantic code search',
  description:
    'Semantic + keyword search over an indexed repository. Returns the most relevant code chunks ' +
    '(file, line range, enclosing function/class, relevance score) with their full source, so you ' +
    'can reason over the actual code. Works well with natural-language descriptions ("where are ' +
    'passwords hashed") and with identifiers ("validateSession").',
  inputSchema: {
    repository: repositoryArgument,
    query: z.string().min(1).max(2000).describe('What to look for, in words or identifiers.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_SEARCH_RESULTS)
      .optional()
      .describe(`How many chunks to return (1-${MAX_SEARCH_RESULTS}, default 8).`),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ repository, query, limit }, { api }) => {
    const repo = await resolveRepository(api, repository);
    return formatSearchResults(repo, query, await api.search(repo.id, query, limit));
  },
});
