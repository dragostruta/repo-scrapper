import { Inject, Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../embedding/embedding-provider';
import { ChunkRepository, type RetrievedChunk } from './chunk-repository.service';
import { assembleContext, type AssembledContext } from './context-assembler';

export interface RetrievalResult {
  context: AssembledContext;
  timings: { embedQuestion: number; retrieve: number };
}

/**
 * The retrieval half of a query: embed the question, run the scoped vector +
 * keyword search, assemble whatever fits the context budget. Everything
 * downstream (answering/) only ever sees the result of this, never touches
 * ChunkRepository directly - that is what keeps retrieval logic in one place
 * for both the HTTP and MCP adapters.
 */
@Injectable()
export class RetrievalService {
  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    private readonly chunkRepository: ChunkRepository,
    private readonly config: AppConfig,
  ) {}

  async retrieve(repositoryId: string, question: string): Promise<RetrievalResult> {
    const { topK, contextTokenBudget, keywordBoost } = this.config.retrieval;

    const embedStart = process.hrtime.bigint();
    const [questionEmbedding] = await this.embeddings.embed([question]);
    const embedQuestion = msSince(embedStart);

    const retrieveStart = process.hrtime.bigint();
    const chunks: RetrievedChunk[] = await this.chunkRepository.search(
      repositoryId,
      questionEmbedding,
      question,
      topK,
      keywordBoost,
    );
    const retrieve = msSince(retrieveStart);

    return {
      context: assembleContext(chunks, contextTokenBudget),
      timings: { embedQuestion, retrieve },
    };
  }
}

function msSince(start: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - start) / 1e6);
}
