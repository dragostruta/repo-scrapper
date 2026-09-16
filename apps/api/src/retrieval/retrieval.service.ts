import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { startTimer } from '../common/timing';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../embedding/embedding-provider';
import { ChunkStore, type RetrievedChunk } from '../persistence/chunk.store';
import { assembleContext, type AssembledContext } from './context-assembler';

export interface SearchResult {
  chunks: RetrievedChunk[];
  timings: { embedQuestion: number; retrieve: number };
}

export interface RetrievalResult {
  context: AssembledContext;
  timings: SearchResult['timings'];
}

/**
 * The retrieval half of a query. `search` ranks chunks for a query;
 * `retrieve` additionally trims them to the context budget for an LLM.
 * Nothing downstream touches ChunkStore or the embedding model directly.
 */
@Injectable()
export class RetrievalService {
  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    private readonly chunks: ChunkStore,
    private readonly config: AppConfig,
  ) {}

  /** Top chunks for `query`, highest score first. `topK` defaults to RETRIEVAL_TOP_K. */
  async search(repositoryId: string, query: string, topK?: number): Promise<SearchResult> {
    const { keywordBoost, topK: defaultTopK } = this.config.retrieval;

    const embedTimer = startTimer();
    const [embedding] = await this.embeddings.embed([query]);
    const embedQuestion = embedTimer();

    const retrieveTimer = startTimer();
    const chunks = await this.chunks.search(repositoryId, {
      embedding,
      text: query,
      topK: topK ?? defaultTopK,
      keywordBoost,
    });

    return { chunks, timings: { embedQuestion, retrieve: retrieveTimer() } };
  }

  /** Search, then keep as many top chunks as fit CONTEXT_TOKEN_BUDGET. */
  async retrieve(repositoryId: string, query: string): Promise<RetrievalResult> {
    const { chunks, timings } = await this.search(repositoryId, query);
    return { context: assembleContext(chunks, this.config.retrieval.contextTokenBudget), timings };
  }
}
