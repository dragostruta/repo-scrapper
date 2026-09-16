import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppLogger } from './common/logging/logger.service';
import { createTraceMiddleware } from './common/logging/trace.middleware';

/**
 * Applies the HTTP-level behaviour every running instance needs: tracing,
 * CORS, request validation and the error shape. Shared by main.ts and the
 * e2e tests, so tests exercise exactly what production serves.
 */
export function configureApp(app: INestApplication): void {
  const logger = app.get(AppLogger);

  app.useLogger(logger);
  app.use(createTraceMiddleware(logger));
  app.enableCors({ origin: true, exposedHeaders: ['x-trace-id'] });
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
}
