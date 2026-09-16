import { z } from 'zod';
import { formatExcerpt } from '../format.js';
import { resolveRepository } from '../repository-resolver.js';
import { repositoryArgument } from './ask-repository.tool.js';
import { defineTool } from './tool.js';

export const getCodeExcerptTool = defineTool({
  name: 'get_code_excerpt',
  title: 'Get a cited code chunk',
  description:
    'Returns the full code of one chunk, by the chunk id shown in ask_repository sources or ' +
    'search_code results.',
  inputSchema: {
    repository: repositoryArgument,
    chunkId: z.string().min(1).describe('Chunk id from a previous result.'),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async ({ repository, chunkId }, { api }) => {
    const repo = await resolveRepository(api, repository);
    return formatExcerpt(repo, await api.getChunkExcerpt(repo.id, chunkId));
  },
});
