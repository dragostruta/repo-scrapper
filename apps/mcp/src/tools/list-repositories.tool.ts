import { formatRepositoryList } from '../format.js';
import { defineTool } from './tool.js';

export const listRepositoriesTool = defineTool({
  name: 'list_repositories',
  title: 'List indexed repositories',
  description:
    'Lists every GitHub repository known to the Code Documentation Assistant, with its id, ' +
    'indexing status (only INDEXED ones can be searched or asked about), file and chunk counts.',
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_args, { api }) => formatRepositoryList(await api.listRepositories()),
});
