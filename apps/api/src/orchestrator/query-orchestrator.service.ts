import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AskResponse, ChunkExcerpt, Citation, ConversationTurn } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/logging/logger.service';
import { currentTraceId, newTraceId } from '../common/logging/trace-context';
import { RetrievalService } from '../retrieval/retrieval.service';
import { LLM_PROVIDER, type LlmProvider } from '../answering/llm-provider';
import { ChunkRepository } from '../retrieval/chunk-repository.service';

/**
 * Owns the query side of the pipeline: load the repository, retrieve +
 * assemble context, call the LLM, log the retrieval trace, return the
 * answer. This is the single method both the HTTP controller and the future
 * MCP `ask_about_repository` tool call - see the architecture note in
 * README about the orchestrator being the one thing both adapters share.
 *
 * The client supplies its own conversation history with each call rather
 * than this service holding any - keeps the server stateless like the rest
 * of the pipeline, at the cost of the client having to resend it (see D9).
 */
@Injectable()
export class QueryOrchestratorService {
  private readonly logger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly retrieval: RetrievalService,
    private readonly chunkRepository: ChunkRepository,
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
    const traceId = currentTraceId() ?? newTraceId();
    const totalStart = process.hrtime.bigint();

    const repository = await this.prisma.repository.findUnique({ where: { id: repositoryId } });
    if (!repository) throw new NotFoundException(`Repository ${repositoryId} not found`);
    if (repository.status !== 'INDEXED') {
      throw new ConflictException(
        `Repository is ${repository.status.toLowerCase()}, not ready to answer questions yet.`,
      );
    }

    const retrievalQuery = buildRetrievalQuery(question, history);
    const { context, timings: retrievalTimings } = await this.retrieval.retrieve(
      repositoryId,
      retrievalQuery,
    );

    const generateStart = process.hrtime.bigint();
    const answer = await this.llm.answer({ question, contextText: context.text, history });
    const generate = msSince(generateStart);

    const timings = {
      embedQuestion: retrievalTimings.embedQuestion,
      retrieve: retrievalTimings.retrieve,
      generate,
      total: msSince(totalStart),
    };

    // Citations are what retrieval handed the model, not a verified per-sentence attribution.
    const citations: Citation[] = context.chunks.map((c) => ({
      chunkId: c.id,
      path: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      symbol: c.symbol,
      language: c.language,
      score: Math.round(c.score * 1000) / 1000,
    }));

    await this.prisma.queryLog
      .create({
        data: {
          repositoryId,
          traceId,
          question,
          answer,
          chunkIds: context.chunks.map((c) => c.id),
          scores: context.chunks.map((c) => c.score),
          timings,
        },
      })
      .catch((err: unknown) =>
        this.logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          'failed to persist query log - answer was still returned',
        ),
      );

    return { answer, citations, timings, traceId };
  }

  /** Backs the "click a citation to see the code" UI - the answer only ever
   * carries citation metadata (see the comment above), so the actual content
   * is fetched on demand, scoped to this repository. */
  async getChunkExcerpt(repositoryId: string, chunkId: string): Promise<ChunkExcerpt> {
    const chunk = await this.chunkRepository.findById(repositoryId, chunkId);
    if (!chunk) throw new NotFoundException(`Chunk ${chunkId} not found in this repository`);
    return {
      path: chunk.filePath,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      symbol: chunk.symbol,
      language: chunk.language,
      content: chunk.content,
    };
  }
}

function msSince(start: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - start) / 1e6);
}

/** Prepends the previous question (not its answer) to the retrieval text, so
 * a short follow-up ("and where is that called from?") still embeds with
 * enough signal to retrieve on-topic chunks. Deliberately narrow - one prior
 * question, not the full thread, and never the answer text - this is a
 * heuristic nudge, not coreference resolution (see D9). */
function buildRetrievalQuery(question: string, history: ConversationTurn[]): string {
  const previousQuestion = history.at(-1)?.question;
  return previousQuestion ? `${previousQuestion} ${question}` : question;
}
