import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@app/shared';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

/** Liveness plus the two settings most worth confirming on a running instance. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** Always 200: a down database reports "degraded" in the body instead of failing the probe. */
  @Get()
  async check(): Promise<HealthResponse> {
    const database = (await this.prisma.ping()) ? 'up' : 'down';
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database },
      config: {
        llmProvider: this.config.llm.provider,
        embeddingModel: this.config.embedding.model,
      },
    };
  }
}
