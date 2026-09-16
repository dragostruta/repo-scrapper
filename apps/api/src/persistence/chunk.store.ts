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
 * else in the codebase ever sees a SQL fragment.
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
   * Cosine similarity over pgvector (`<=>` is cosine distance, so similarity
   * is 1 minus it), scoped to one repository, plus an additive trigram
   * keyword boost (D6). Highest score first.
   */
  async search(repositoryId: string, query: ChunkSearchQuery): Promise<RetrievedChunk[]> {
    const vector = Prisma.raw(`'${toVectorLiteral(query.embedding)}'::vector`);
    const rows = await this.prisma.$queryRaw<RetrievedChunk[]>`
      SELECT id, "filePath", language, symbol, "startLine", "endLine", content,
        (1 - (embedding <=> ${vector})) + (${query.keywordBoost} * similarity(content, ${query.text})) AS score
      FROM chunks
      WHERE "repositoryId" = ${repositoryId} AND embedding IS NOT NULL
      ORDER BY score DESC
      LIMIT ${query.topK}
    `;
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
    ${Prisma.raw(`'${toVectorLiteral(r.embedding)}'::vector`)}, now()
  )`;
}
