import { Module } from '@nestjs/common';
import { EmbeddingModule } from '../embedding/embedding.module';
import { PersistenceModule } from '../persistence/persistence.module';
import { RetrievalService } from './retrieval.service';

@Module({
  imports: [EmbeddingModule, PersistenceModule],
  providers: [RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
