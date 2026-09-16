import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppLogger } from './common/logging/logger.service';
import { createTraceMiddleware } from './common/logging/trace.middleware';
import { IngestOrchestratorService } from './orchestrator/ingest-orchestrator.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(AppLogger);
  const config = app.get(AppConfig);

  app.useLogger(logger);
  app.use(createTraceMiddleware(logger));

  app.enableCors({
    origin: true,
    exposedHeaders: ['x-trace-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(logger));
  app.enableShutdownHooks();

  // A restart can leave rows stuck mid-index (D8: no queue) - sweepOrphaned() retries them.
  await app.get(IngestOrchestratorService).sweepOrphaned();

  await app.listen(config.port, '0.0.0.0');

  logger.root.info(
    { context: 'bootstrap', port: config.port, llmProvider: config.llm.provider },
    `API listening on http://0.0.0.0:${config.port}`,
  );
}

void bootstrap();
