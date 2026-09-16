import { Module } from '@nestjs/common';
import { IngestModule } from '../ingest/ingest.module';
import { ChunkingModule } from '../chunking/chunking.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { AnsweringModule } from '../answering/answering.module';
import { IngestOrchestratorService } from './ingest-orchestrator.service';
import { QueryOrchestratorService } from './query-orchestrator.service';

// EmbeddingModule is imported explicitly, not just transitively via
// RetrievalModule: IngestOrchestratorService injects EMBEDDING_PROVIDER
// directly, and Nest's module encapsulation requires that.
@Module({
  imports: [IngestModule, ChunkingModule, EmbeddingModule, RetrievalModule, AnsweringModule],
  providers: [IngestOrchestratorService, QueryOrchestratorService],
  exports: [IngestOrchestratorService, QueryOrchestratorService],
})
export class OrchestratorModule {}
