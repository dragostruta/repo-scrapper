import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppLogger } from '../common/logging/logger.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly logger: AppLogger) {
    // Prisma's own warnings and errors go to stdout. They are rare enough
    // that routing them through pino is not worth the type gymnastics.
    super({ log: ['warn', 'error'] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.forContext('PrismaService').info('database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cheap liveness probe used by /health. */
  async ping(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
