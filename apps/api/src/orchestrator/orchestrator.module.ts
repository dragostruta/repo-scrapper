import { Module } from '@nestjs/common';
import { AnsweringModule } from '../answering/answering.module';
import { ChunkingModule } from '../chunking/chunking.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { IngestModule } from '../ingest/ingest.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { FileIndexerService } from './file-indexer.service';
import { IngestOrchestratorService } from './ingest-orchestrator.service';
import { QueryOrchestratorService } from './query-orchestrator.service';
import { RepositoryIndexerService } from './repository-indexer.service';

@Module({
  imports: [
    IngestModule,
    ChunkingModule,
    EmbeddingModule,
    RetrievalModule,
    AnsweringModule,
    PersistenceModule,
  ],
  providers: [
    FileIndexerService,
    RepositoryIndexerService,
    IngestOrchestratorService,
    QueryOrchestratorService,
  ],
  exports: [IngestOrchestratorService, QueryOrchestratorService, FileIndexerService],
})
export class OrchestratorModule {}
