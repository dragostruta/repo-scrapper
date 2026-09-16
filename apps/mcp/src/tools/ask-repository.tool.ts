import { z } from 'zod';
import { formatAnswer } from '../format.js';
import { resolveRepository } from '../repository-resolver.js';
import { defineTool } from './tool.js';

export const repositoryArgument = z
  .string()
  .min(1)
  .describe('Repository id, or "owner/name" (e.g. nestjs/nest), as shown by list_repositories.');

export const askRepositoryTool = defineTool({
  name: 'ask_repository',
  title: 'Ask a question about a repository',
  description:
    "Answers a question about an indexed repository using the assistant's own RAG pipeline and " +
    'LLM, citing the source chunks it used. Prefer search_code when you want to read the code ' +
    'yourself - this is for a quick grounded answer.',
  inputSchema: {
    repository: repositoryArgument,
    question: z.string().min(1).max(2000).describe('A question about the code.'),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ repository, question }, { api }) => {
    const repo = await resolveRepository(api, repository);
    return formatAnswer(repo, await api.ask(repo.id, question));
  },
});
