import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toVectorLiteral } from './vector-literal';

/** A chunk ready to be written, embedding included. */
export interface ChunkRecord {
  filePath: string;
  language: string;
  symbol: string | null;
  startLine: number;
  endLine: number;
  content: string;
  tokenCount: number;
  embedding: number[];
}

/** A stored chunk as read back, without its embedding. */
export interface StoredChunk {
  id: string;
  filePath: string;
  language: string;
  symbol: string | null;
  startLine: number;
  endLine: number;
  content: string;
}

export interface RetrievedChunk extends StoredChunk {
  /** Cosine similarity plus the keyword boost (D6) - a ranking score, not a
   * strict [0,1] probability once the boost is added. */
  score: number;
}

export interface ChunkSearchQuery {
  embedding: number[];
  /** Raw query text, used for the trigram keyword boost. */
  text: string;
  topK: number;
  keywordBoost: number;
}

const INSERT_BATCH_SIZE = 200;

/**
 * Search runs in two stages (D6). The first is a pure nearest-neighbour
 * ordering, which is the only shape pgvector's HNSW index can accelerate -
 * adding anything to that ORDER BY silently turns it into a sequential scan.
 * The second reranks just those candidates with the keyword boost.
 *
 * The pool is deliberately wider than topK so the rerank has something to
 * reorder, and so the `repositoryId` filter still leaves enough rows: HNSW
 * applies that filter to what the index walk already returned, so a narrow
 * walk can come back nearly empty for a repository that is a small share of
 * the table.
 */
const CANDIDATE_MULTIPLIER = 10;
const MAX_CANDIDATES = 200;

export function candidatePoolSize(topK: number): number {
  return Math.min(topK * CANDIDATE_MULTIPLIER, MAX_CANDIDATES);
}

const STORED_CHUNK_COLUMNS = {
  id: true,
  filePath: true,
  language: true,
  symbol: true,
  startLine: true,
  endLine: true,
  content: true,
} as const;

/**
 * Owns every read and write of the `chunks` table. pgvector has no Prisma
 * type, so vector reads and writes use raw SQL - isolated here, so nothing
 * else in the codebase ever sees a SQL fragment. Every value, the vector
 * included, is passed as a bound parameter.
 */
@Injectable()
export class ChunkStore {
  constructor(private readonly prisma: PrismaService) {}

  async deleteForRepository(repositoryId: string): Promise<void> {
    await this.prisma.chunk.deleteMany({ where: { repositoryId } });
  }

  async insertMany(repositoryId: string, records: ChunkRecord[]): Promise<void> {
    for (let i = 0; i < records.length; i += INSERT_BATCH_SIZE) {
      const rows = records.slice(i, i + INSERT_BATCH_SIZE).map((r) => toInsertRow(repositoryId, r));
      await this.prisma.$executeRaw`
        INSERT INTO chunks
          (id, "repositoryId", "filePath", language, symbol, "startLine", "endLine", content, "tokenCount", embedding, "createdAt")
        VALUES ${Prisma.join(rows)}
      `;
    }
  }

  /**
   * Stage 1 finds the nearest neighbours by cosine distance alone, scoped to
   * one repository. Stage 2 reranks that pool with an additive trigram
   * keyword boost (D6) and keeps the best `topK`. Highest score first.
   *
   * `hnsw.ef_search` caps how many candidates the index walk returns and
   * defaults to 40, so a larger LIMIT alone does not widen the pool - asking
   * for 80 candidates without raising it measurably returns 39. It is raised
   * to match the pool, inside a transaction: SET LOCAL takes no bind
   * parameters, so set_config's third argument does the same job and restores
   * the default on commit rather than leaking onto a pooled connection.
   */
  async search(repositoryId: string, query: ChunkSearchQuery): Promise<RetrievedChunk[]> {
    const vector = toVectorLiteral(query.embedding);
    const poolSize = candidatePoolSize(query.topK);

    const [, rows] = await this.prisma.$transaction([
      this.prisma.$queryRaw`SELECT set_config('hnsw.ef_search', ${String(poolSize)}, true)`,
      this.prisma.$queryRaw<(StoredChunk & { score: number | string })[]>`
      WITH candidates AS (
        SELECT id, "filePath", language, symbol, "startLine", "endLine", content,
          embedding <=> ${vector}::vector AS distance
        FROM chunks
        WHERE "repositoryId" = ${repositoryId} AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vector}::vector
        LIMIT ${poolSize}
      )
      SELECT id, "filePath", language, symbol, "startLine", "endLine", content,
        (1 - distance) + (${query.keywordBoost} * similarity(content, ${query.text})) AS score
      FROM candidates
      ORDER BY score DESC
      LIMIT ${query.topK}
    `,
    ]);

    return rows.map((row) => ({ ...row, score: Number(row.score) }));
  }

  /** Scoped to the repository as well as the id, so a chunk id from one
   * repository can never be used to read another's code. */
  async findById(repositoryId: string, chunkId: string): Promise<StoredChunk | null> {
    return this.prisma.chunk.findFirst({
      where: { id: chunkId, repositoryId },
      select: STORED_CHUNK_COLUMNS,
    });
  }
}

function toInsertRow(repositoryId: string, r: ChunkRecord): Prisma.Sql {
  return Prisma.sql`(
    ${randomUUID()}, ${repositoryId}, ${r.filePath}, ${r.language}, ${r.symbol},
    ${r.startLine}, ${r.endLine}, ${r.content}, ${r.tokenCount},
    ${toVectorLiteral(r.embedding)}::vector, now()
  )`;
}
