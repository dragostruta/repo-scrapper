import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: {
    database: 'up' | 'down';
  };
  config: {
    llmProvider: string;
    embeddingModel: string;
  };
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
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
