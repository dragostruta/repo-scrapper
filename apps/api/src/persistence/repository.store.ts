import { Injectable } from '@nestjs/common';
import type { RepositorySummary } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toRepositorySummary } from './repository.mapper';

export interface NewGithubRepository {
  url: string;
  name: string;
  /** The remote HEAD sha, or a placeholder until the clone reports the real one. */
  revision: string;
}

export interface IndexStats {
  fileCount: number;
  chunkCount: number;
}

/** Stored error messages are capped - a full git stderr can be very long. */
const MAX_ERROR_LENGTH = 2000;

/**
 * Owns every read and write of the `repositories` table, and is the only
 * place a repository's status changes. Returns `RepositorySummary`, so
 * Prisma's generated types never leak past this layer.
 */
@Injectable()
export class RepositoryStore {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<RepositorySummary | null> {
    const row = await this.prisma.repository.findUnique({ where: { id } });
    return row ? toRepositorySummary(row) : null;
  }

  async findGithubRevision(name: string, revision: string): Promise<RepositorySummary | null> {
    const row = await this.prisma.repository.findUnique({
      where: { source_name_revision: { source: 'GITHUB', name, revision } },
    });
    return row ? toRepositorySummary(row) : null;
  }

  async list(): Promise<RepositorySummary[]> {
    const rows = await this.prisma.repository.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(toRepositorySummary);
  }

  async createGithub(repo: NewGithubRepository): Promise<RepositorySummary> {
    const row = await this.prisma.repository.create({
      data: { source: 'GITHUB', ...repo, status: 'CLONING' },
    });
    return toRepositorySummary(row);
  }

  /** Puts a FAILED repository back into CLONING for a retry. */
  async markCloning(id: string): Promise<RepositorySummary> {
    const row = await this.prisma.repository.update({
      where: { id },
      data: { status: 'CLONING', error: null },
    });
    return toRepositorySummary(row);
  }

  async markIndexing(id: string, revision: string): Promise<void> {
    await this.prisma.repository.update({ where: { id }, data: { revision, status: 'INDEXING' } });
  }

  async markIndexed(id: string, stats: IndexStats): Promise<void> {
    await this.prisma.repository.update({
      where: { id },
      data: { status: 'INDEXED', ...stats, indexedAt: new Date(), error: null },
    });
  }

  async markFailed(id: string, message: string): Promise<void> {
    await this.prisma.repository.update({
      where: { id },
      data: { status: 'FAILED', error: message.slice(0, MAX_ERROR_LENGTH) },
    });
  }

  /** Marks every CLONING/INDEXING row FAILED; returns how many there were. */
  async failInProgress(message: string): Promise<number> {
    const { count } = await this.prisma.repository.updateMany({
      where: { status: { in: ['PENDING', 'CLONING', 'INDEXING'] } },
      data: { status: 'FAILED', error: message },
    });
    return count;
  }
}
