import { aRetrievedChunk } from '../../test/helpers/builders';
import type { AppConfig } from '../config/app-config';
import type { EmbeddingProvider } from '../embedding/embedding-provider';
import type { ChunkStore } from '../persistence/chunk.store';
import { RetrievalService } from './retrieval.service';

function setup(contextTokenBudget = 4000) {
  const embeddings: EmbeddingProvider = { dimensions: 2, embed: jest.fn(async () => [[0.5, 0.5]]) };
  const chunks = {
    search: jest.fn(async () => [aRetrievedChunk({ id: 'a' }), aRetrievedChunk({ id: 'b' })]),
  };
  const config = {
    retrieval: { topK: 8, keywordBoost: 0.15, contextTokenBudget },
  } as unknown as AppConfig;
  return {
    embeddings,
    chunks,
    service: new RetrievalService(embeddings, chunks as unknown as ChunkStore, config),
  };
}

describe('RetrievalService', () => {
  it('search embeds the query and searches with the configured defaults', async () => {
    const { service, embeddings, chunks } = setup();

    const result = await service.search('r1', 'how does login work');

    expect(embeddings.embed).toHaveBeenCalledWith(['how does login work']);
    expect(chunks.search).toHaveBeenCalledWith('r1', {
      embedding: [0.5, 0.5],
      text: 'how does login work',
      topK: 8,
      keywordBoost: 0.15,
    });
    expect(result.chunks.map((c) => c.id)).toEqual(['a', 'b']);
    expect(result.timings).toEqual({
      embedQuestion: expect.any(Number),
      retrieve: expect.any(Number),
    });
  });

  it('search honours an explicit topK', async () => {
    const { service, chunks } = setup();
    await service.search('r1', 'q', 3);
    expect(chunks.search).toHaveBeenCalledWith('r1', expect.objectContaining({ topK: 3 }));
  });

  it('retrieve assembles the ranked chunks into LLM context', async () => {
    const { service } = setup();
    const { context } = await service.retrieve('r1', 'q');
    expect(context.chunks).toHaveLength(2);
    expect(context.text).toContain('--- src/auth.ts:10-20 (login) ---');
  });

  it('retrieve trims to the context budget', async () => {
    const { service } = setup(5);
    const { context } = await service.retrieve('r1', 'q');
    expect(context.chunks.map((c) => c.id)).toEqual(['a']);
  });

  it('propagates embedding failures', async () => {
    const { service, embeddings } = setup();
    (embeddings.embed as jest.Mock).mockRejectedValue(new Error('model missing'));
    await expect(service.search('r1', 'q')).rejects.toThrow('model missing');
  });
});
