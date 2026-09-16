import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { LoggingModule } from './common/logging/logging.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { IngestModule } from './ingest/ingest.module';
import { ChunkingModule } from './chunking/chunking.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { AnsweringModule } from './answering/answering.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { RepositoriesModule } from './repositories/repositories.module';

/**
 * Feature modules are deliberately thin and single-purpose. The dependency
 * direction is one-way: adapters (http, mcp) depend on the orchestrator, the
 * orchestrator depends on the pipeline modules, and nothing depends on an
 * adapter. That is what keeps the MCP server from duplicating business logic.
 */
@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    HealthModule,
    IngestModule,
    ChunkingModule,
    EmbeddingModule,
    RetrievalModule,
    AnsweringModule,
    OrchestratorModule,
    RepositoriesModule,
  ],
})
export class AppModule {}
