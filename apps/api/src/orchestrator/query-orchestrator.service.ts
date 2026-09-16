import { Inject, Injectable } from '@nestjs/common';
import type { AskResponse, ChunkExcerpt, ConversationTurn, SearchResponse } from '@app/shared';
import { AppLogger } from '../common/logging/logger.service';
import { currentTraceId, newTraceId } from '../common/logging/trace-context';
import {
  ChunkNotFoundError,
  RepositoryNotFoundError,
  RepositoryNotReadyError,
} from '../common/errors/domain-errors';
import { errorMessage } from '../common/errors/error-message';
import { startTimer } from '../common/timing';
import { LLM_PROVIDER, type LlmProvider } from '../answering/llm-provider';
import { ChunkStore, type RetrievedChunk } from '../persistence/chunk.store';
import { QueryLogStore } from '../persistence/query-log.store';
import { RepositoryStore } from '../persistence/repository.store';
import { buildRetrievalQuery } from '../retrieval/retrieval-query';
import { RetrievalService } from '../retrieval/retrieval.service';
import { toChunkExcerpt, toCitation, toSearchHit } from './chunk.mappers';

/**
 * Owns the question side of the pipeline: check the repository is ready,
 * retrieve context, generate an answer, record the trace. The client sends
 * its own conversation history each time, so this stays stateless (D9).
 */
@Injectable()
export class QueryOrchestratorService {
  private readonly logger;

  constructor(
    private readonly repositories: RepositoryStore,
    private readonly retrieval: RetrievalService,
    private readonly chunks: ChunkStore,
    private readonly queryLogs: QueryLogStore,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    logger: AppLogger,
  ) {
    this.logger = logger.forContext('QueryOrchestratorService');
  }

  async ask(
    repositoryId: string,
    question: string,
    history: ConversationTurn[] = [],
  ): Promise<AskResponse> {
    const totalTimer = startTimer();
    await this.requireIndexed(repositoryId);

    const retrievalQuery = buildRetrievalQuery(question, history);
    const { context, timings } = await this.retrieval.retrieve(repositoryId, retrievalQuery);

    const generateTimer = startTimer();
    const answer = await this.llm.answer({ question, contextText: context.text, history });

    const response: AskResponse = {
      answer,
      // What retrieval handed the model - not a verified per-sentence attribution.
      citations: context.chunks.map(toCitation),
      timings: { ...timings, generate: generateTimer(), total: totalTimer() },
      traceId: currentTraceId() ?? newTraceId(),
    };

    await this.recordQuery(repositoryId, question, response, context.chunks);
    return response;
  }

  /**
   * Retrieval without generation: the ranked chunks themselves. For clients
   * that are already an LLM (e.g. Claude Code over MCP), raw code beats a
   * second model's summary of it.
   */
  async search(repositoryId: string, query: string, limit?: number): Promise<SearchResponse> {
    await this.requireIndexed(repositoryId);
    const { chunks, timings } = await this.retrieval.search(repositoryId, query, limit);
    return { results: chunks.map(toSearchHit), timings };
  }

  /** Backs "click a citation to see the code": content is fetched on demand. */
  async getChunkExcerpt(repositoryId: string, chunkId: string): Promise<ChunkExcerpt> {
    const chunk = await this.chunks.findById(repositoryId, chunkId);
    if (!chunk) throw new ChunkNotFoundError(chunkId);
    return toChunkExcerpt(chunk);
  }

  private async requireIndexed(repositoryId: string): Promise<void> {
    const repository = await this.repositories.findById(repositoryId);
    if (!repository) throw new RepositoryNotFoundError(repositoryId);
    if (repository.status !== 'INDEXED') throw new RepositoryNotReadyError(repository.status);
  }

  /** Best effort: losing a trace row must never cost the user their answer. */
  private async recordQuery(
    repositoryId: string,
    question: string,
    response: AskResponse,
    chunks: RetrievedChunk[],
  ): Promise<void> {
    await this.queryLogs
      .record({
        repositoryId,
        traceId: response.traceId,
        question,
        answer: response.answer,
        chunkIds: chunks.map((c) => c.id),
        scores: chunks.map((c) => c.score),
        timings: response.timings,
      })
      .catch((err: unknown) =>
        this.logger.warn({ err: errorMessage(err) }, 'failed to record query log'),
      );
  }
}
