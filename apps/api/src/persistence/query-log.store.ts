import { Injectable } from '@nestjs/common';
import type { AskResponse } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';

/** One answered question and the retrieval trace behind it. */
export interface QueryLogEntry {
  repositoryId: string;
  traceId: string;
  question: string;
  answer: string;
  /** Retrieved chunk ids and their scores, in rank order. */
  chunkIds: string[];
  scores: number[];
  timings: AskResponse['timings'];
}

@Injectable()
export class QueryLogStore {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: QueryLogEntry): Promise<void> {
    await this.prisma.queryLog.create({ data: { ...entry, timings: { ...entry.timings } } });
  }
}
