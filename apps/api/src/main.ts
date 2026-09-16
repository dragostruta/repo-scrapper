import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfig } from './config/app-config';
import { AppLogger } from './common/logging/logger.service';
import { IngestOrchestratorService } from './orchestrator/ingest-orchestrator.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);

  // A restart can leave rows stuck mid-index (D8: no queue) - mark them retryable.
  await app.get(IngestOrchestratorService).recoverInterruptedIndexing();

  const { port, llm } = app.get(AppConfig);
  await app.listen(port, '0.0.0.0');

  app
    .get(AppLogger)
    .root.info(
      { context: 'bootstrap', port, llmProvider: llm.provider },
      `API listening on http://0.0.0.0:${port}`,
    );
}

void bootstrap();
