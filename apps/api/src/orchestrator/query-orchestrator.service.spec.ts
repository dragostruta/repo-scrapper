import { aRepository, aRetrievedChunk } from '../../test/helpers/builders';
import { createFakeLogger } from '../../test/helpers/fake-logger';
import {
  ChunkNotFoundError,
  LlmUnavailableError,
  RepositoryNotFoundError,
  RepositoryNotReadyError,
} from '../common/errors/domain-errors';
import { runWithTrace } from '../common/logging/trace-context';
import type { LlmProvider } from '../answering/llm-provider';
import type { ChunkStore } from '../persistence/chunk.store';
import type { QueryLogStore } from '../persistence/query-log.store';
import type { RepositoryStore } from '../persistence/repository.store';
import type { RetrievalService } from '../retrieval/retrieval.service';
import { QueryOrchestratorService } from './query-orchestrator.service';

function setup() {
  const chunks = [
    aRetrievedChunk({ id: 'c1', score: 0.91 }),
    aRetrievedChunk({ id: 'c2', score: 0.5 }),
  ];
  const repositories = { findById: jest.fn().mockResolvedValue(aRepository({ id: 'r1' })) };
  const retrieval = {
    search: jest.fn().mockResolvedValue({ chunks, timings: { embedQuestion: 3, retrieve: 5 } }),
    retrieve: jest.fn().mockResolvedValue({
      context: { chunks, text: 'CONTEXT TEXT', estimatedTokens: 10 },
      timings: { embedQuestion: 4, retrieve: 6 },
    }),
  };
  const chunkStore = { findById: jest.fn() };
  const queryLogs = { record: jest.fn().mockResolvedValue(undefined) };
  const llm: LlmProvider = { answer: jest.fn().mockResolvedValue('It hashes the password.') };
  const logger = createFakeLogger();
  const service = new QueryOrchestratorService(
    repositories as unknown as RepositoryStore,
    retrieval as unknown as RetrievalService,
    chunkStore as unknown as ChunkStore,
    queryLogs as unknown as QueryLogStore,
    llm,
    logger,
  );
  return { service, repositories, retrieval, chunkStore, queryLogs, llm, logger };
}

describe('QueryOrchestratorService.ask', () => {
  it('retrieves context, answers, and returns citations with timings', async () => {
    const { service, retrieval, llm } = setup();

    const response = await runWithTrace('trace-7', () => service.ask('r1', 'How does login work?'));

    expect(retrieval.retrieve).toHaveBeenCalledWith('r1', 'How does login work?');
    expect(llm.answer).toHaveBeenCalledWith({
      question: 'How does login work?',
      contextText: 'CONTEXT TEXT',
      history: [],
    });
    expect(response.answer).toBe('It hashes the password.');
    expect(response.citations.map((c) => c.chunkId)).toEqual(['c1', 'c2']);
    expect(response.traceId).toBe('trace-7');
    expect(response.timings).toEqual({
      embedQuestion: 4,
      retrieve: 6,
      generate: expect.any(Number),
      total: expect.any(Number),
    });
  });

  it('mints a trace id when called outside a request', async () => {
    const { service } = setup();
    expect((await service.ask('r1', 'q')).traceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses the previous question for retrieval but passes full history to the model', async () => {
    const { service, retrieval, llm } = setup();
    const history = [{ question: 'How does login work?', answer: 'It hashes.' }];

    await service.ask('r1', 'where is that called?', history);

    expect(retrieval.retrieve).toHaveBeenCalledWith(
      'r1',
      'How does login work? where is that called?',
    );
    expect(llm.answer).toHaveBeenCalledWith(expect.objectContaining({ history }));
  });

  it('records the retrieval trace for the answer', async () => {
    const { service, queryLogs } = setup();

    const response = await service.ask('r1', 'q');

    expect(queryLogs.record).toHaveBeenCalledWith({
      repositoryId: 'r1',
      traceId: response.traceId,
      question: 'q',
      answer: 'It hashes the password.',
      chunkIds: ['c1', 'c2'],
      scores: [0.91, 0.5],
      timings: response.timings,
    });
  });

  it('still returns the answer when the trace cannot be recorded', async () => {
    const { service, queryLogs, logger } = setup();
    queryLogs.record.mockRejectedValue(new Error('db down'));

    await expect(service.ask('r1', 'q')).resolves.toMatchObject({
      answer: 'It hashes the password.',
    });
    expect(logger.logs.warn).toHaveBeenCalled();
  });

  it('throws RepositoryNotFoundError for an unknown repository, before any retrieval', async () => {
    const { service, repositories, retrieval } = setup();
    repositories.findById.mockResolvedValue(null);

    await expect(service.ask('missing', 'q')).rejects.toThrow(RepositoryNotFoundError);
    expect(retrieval.retrieve).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'CLONING', 'INDEXING', 'FAILED'] as const)(
    'refuses to answer while the repository is %s',
    async (status) => {
      const { service, repositories, llm } = setup();
      repositories.findById.mockResolvedValue(aRepository({ status }));

      await expect(service.ask('r1', 'q')).rejects.toThrow(RepositoryNotReadyError);
      expect(llm.answer).not.toHaveBeenCalled();
    },
  );

  it('answers with no citations when retrieval finds nothing', async () => {
    const { service, retrieval } = setup();
    retrieval.retrieve.mockResolvedValue({
      context: { chunks: [], text: '', estimatedTokens: 0 },
      timings: { embedQuestion: 1, retrieve: 1 },
    });
    expect((await service.ask('r1', 'q')).citations).toEqual([]);
  });

  it('propagates an unavailable LLM and records nothing', async () => {
    const { service, llm, queryLogs } = setup();
    (llm.answer as jest.Mock).mockRejectedValue(new LlmUnavailableError('ollama down'));

    await expect(service.ask('r1', 'q')).rejects.toThrow('ollama down');
    expect(queryLogs.record).not.toHaveBeenCalled();
  });
});

describe('QueryOrchestratorService.getChunkExcerpt', () => {
  it('returns the cited code scoped to the repository', async () => {
    const { service, chunkStore } = setup();
    chunkStore.findById.mockResolvedValue(aRetrievedChunk({ content: 'function login() {}' }));

    const excerpt = await service.getChunkExcerpt('r1', 'chunk-1');

    expect(chunkStore.findById).toHaveBeenCalledWith('r1', 'chunk-1');
    expect(excerpt.content).toBe('function login() {}');
  });

  it('throws ChunkNotFoundError when the chunk is not in that repository', async () => {
    const { service, chunkStore } = setup();
    chunkStore.findById.mockResolvedValue(null);
    await expect(service.getChunkExcerpt('r1', 'other-repos-chunk')).rejects.toThrow(
      ChunkNotFoundError,
    );
  });
});

describe('QueryOrchestratorService.search', () => {
  it('returns ranked chunks with their code, without calling the LLM', async () => {
    const { service, retrieval, llm, queryLogs } = setup();

    const response = await service.search('r1', 'password hashing', 5);

    expect(retrieval.search).toHaveBeenCalledWith('r1', 'password hashing', 5);
    expect(response.results.map((r) => [r.chunkId, r.score])).toEqual([
      ['c1', 0.91],
      ['c2', 0.5],
    ]);
    expect(response.results[0].content).toBe('export function login() {}');
    expect(response.timings).toEqual({ embedQuestion: 3, retrieve: 5 });
    expect(llm.answer).not.toHaveBeenCalled();
    expect(queryLogs.record).not.toHaveBeenCalled();
  });

  it('uses the default limit when none is given', async () => {
    const { service, retrieval } = setup();
    await service.search('r1', 'q');
    expect(retrieval.search).toHaveBeenCalledWith('r1', 'q', undefined);
  });

  it('refuses to search a repository that is not indexed', async () => {
    const { service, repositories, retrieval } = setup();
    repositories.findById.mockResolvedValue(aRepository({ status: 'CLONING' }));
    await expect(service.search('r1', 'q')).rejects.toThrow(RepositoryNotReadyError);
    expect(retrieval.search).not.toHaveBeenCalled();
  });

  it('returns no results for an empty repository', async () => {
    const { service, retrieval } = setup();
    retrieval.search.mockResolvedValue({ chunks: [], timings: { embedQuestion: 1, retrieve: 1 } });
    expect((await service.search('r1', 'q')).results).toEqual([]);
  });
});
