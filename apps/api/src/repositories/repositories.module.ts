import { Module } from '@nestjs/common';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { RepositoriesController } from './repositories.controller';

@Module({
  imports: [OrchestratorModule],
  controllers: [RepositoriesController],
})
export class RepositoriesModule {}
