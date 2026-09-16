import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module';
import { ChunkRepository } from './chunk-repository.service';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [EmbeddingModule],
  providers: [ChunkRepository, RetrievalService],
  exports: [ChunkRepository, RetrievalService],
})
export class RetrievalModule {}
