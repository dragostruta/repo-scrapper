import { z } from 'zod';
import { formatRepository } from '../format.js';
import { waitForIndexing } from '../wait-for-indexing.js';
import { defineTool } from './tool.js';

export const indexRepositoryTool = defineTool({
  name: 'index_repository',
  title: 'Index a GitHub repository',
  description:
    'Clones a public GitHub repository and indexes it (code-aware chunking + local embeddings) so ' +
    'it can be searched and asked about. Re-indexing the same commit is free: it returns the ' +
    'existing index. By default waits until indexing finishes; pass wait=false to return immediately.',
  inputSchema: {
    url: z.string().url().describe('Public GitHub URL, e.g. https://github.com/owner/repo'),
    wait: z
      .boolean()
      .default(true)
      .describe('Wait for indexing to finish (can take minutes for large repositories).'),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async ({ url, wait }, { api, indexing }) => {
    const created = await api.createRepository(url);
    if (!wait) return `Indexing started: ${formatRepository(created)}`;

    const { repository, timedOut } = await waitForIndexing(api, created, indexing);
    if (timedOut) {
      return (
        `Still indexing after ${Math.round(indexing.timeoutMs / 1000)}s: ${formatRepository(repository)}. ` +
        'Check again later with list_repositories.'
      );
    }
    if (repository.status === 'FAILED') {
      throw new Error(`Indexing failed: ${formatRepository(repository)}`);
    }
    return `Ready: ${formatRepository(repository)}`;
  },
});
