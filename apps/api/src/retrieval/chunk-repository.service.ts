import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toVectorLiteral } from './vector-literal';

export interface ChunkToInsert {
  filePath: string;
  language: string;
  symbol: string | null;
  startLine: number;
  endLine: number;
  content: string;
  tokenCount: number;
  embedding: number[];
}

export interface RetrievedChunk {
  id: string;
  filePath: string;
  language: string;
  symbol: string | null;
  startLine: number;
  endLine: number;
  content: string;
  /** Cosine similarity plus the keyword boost - see D6. Not a strict [0,1]
   * probability once the boost is added, just a ranking score. */
  score: number;
}

const INSERT_BATCH_SIZE = 200;

/**
 * Owns every raw-SQL touch of the `chunks` table. Isolating pgvector's raw
 * SQL here means the rest of the codebase only ever sees plain TypeScript
 * types (ChunkToInsert / RetrievedChunk), never a SQL fragment.
 */
@Injectable()
export class ChunkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async deleteForRepository(repositoryId: string): Promise<void> {
    await this.prisma.chunk.deleteMany({ where: { repositoryId } });
  }

  /** Scoped to repositoryId as well as id so a citation from one repository
   * can never be used to read a chunk out of another. */
  async findById(repositoryId: string, chunkId: string) {
    return this.prisma.chunk.findFirst({
      where: { id: chunkId, repositoryId },
      select: {
        filePath: true,
        startLine: true,
        endLine: true,
        symbol: true,
        language: true,
        content: true,
      },
    });
  }

  async insertMany(repositoryId: string, chunks: ChunkToInsert[]): Promise<void> {
    for (let i = 0; i < chunks.length; i += INSERT_BATCH_SIZE) {
      const batch = chunks.slice(i, i + INSERT_BATCH_SIZE);
      const rows = batch.map(
        (c) => Prisma.sql`(
          ${randomUUID()}, ${repositoryId}, ${c.filePath}, ${c.language}, ${c.symbol},
          ${c.startLine}, ${c.endLine}, ${c.content}, ${c.tokenCount},
          ${Prisma.raw(`'${toVectorLiteral(c.embedding)}'::vector`)}, now()
        )`,
      );

      await this.prisma.$executeRaw`
        INSERT INTO chunks
          (id, "repositoryId", "filePath", language, symbol, "startLine", "endLine", content, "tokenCount", embedding, "createdAt")
        VALUES ${Prisma.join(rows)}
      `;
    }
  }

  /**
   * Cosine similarity over pgvector, filtered to one repository, with an
   * additive trigram lexical boost (D6). `<=>` is pgvector's cosine distance
   * operator; similarity is 1 minus that.
   */
  async search(
    repositoryId: string,
    queryEmbedding: number[],
    queryText: string,
    topK: number,
    keywordBoost: number,
  ): Promise<RetrievedChunk[]> {
    const vectorLiteral = toVectorLiteral(queryEmbedding);

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        filePath: string;
        language: string;
        symbol: string | null;
        startLine: number;
        endLine: number;
        content: string;
        score: number;
      }[]
    >`
      SELECT
        id,
        "filePath",
        language,
        symbol,
        "startLine",
        "endLine",
        content,
        (1 - (embedding <=> ${Prisma.raw(`'${vectorLiteral}'::vector`)}))
          + (${keywordBoost} * similarity(content, ${queryText})) AS score
      FROM chunks
      WHERE "repositoryId" = ${repositoryId}
        AND embedding IS NOT NULL
      ORDER BY score DESC
      LIMIT ${topK}
    `;

    return rows.map((r) => ({ ...r, score: Number(r.score) }));
  }
}
