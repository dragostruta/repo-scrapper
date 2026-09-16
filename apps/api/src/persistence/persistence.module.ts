import { Module } from '@nestjs/common';
import { ChunkStore } from './chunk.store';
import { QueryLogStore } from './query-log.store';
import { RepositoryStore } from './repository.store';

/** Every database read and write goes through a store in this module.
 * PrismaService itself is provided globally by PrismaModule. */
@Module({
  providers: [RepositoryStore, ChunkStore, QueryLogStore],
  exports: [RepositoryStore, ChunkStore, QueryLogStore],
})
export class PersistenceModule {}
