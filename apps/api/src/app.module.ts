import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { LoggingModule } from './common/logging/logging.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { RepositoriesModule } from './repositories/repositories.module';

/**
 * Dependencies point one way:
 *
 *   HTTP controllers -> orchestrators -> pipeline modules (ingest, chunking,
 *   embedding, retrieval, answering) -> persistence (stores) -> Prisma
 *
 * Nothing depends on a controller. Config, logging and Prisma are global.
 * The MCP server (apps/mcp) is a separate process that talks to these same
 * controllers over HTTP, so it adds no second copy of any business logic.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    HealthModule,
    OrchestratorModule,
    RepositoriesModule,
  ],
})
export class AppModule {}
