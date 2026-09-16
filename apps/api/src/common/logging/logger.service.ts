import { Injectable, LoggerService, Scope } from '@nestjs/common';
import pino, { Logger } from 'pino';
import { AppConfig } from '../../config/app-config';
import { currentTraceId } from './trace-context';

/**
 * Nest's default logger is fine for a demo and useless in production: no
 * structure, no correlation, no levels you can filter on. This adapter keeps
 * Nest's LoggerService interface (so framework logs flow through it too) and
 * writes newline-delimited JSON via pino, with the active trace id mixed into
 * every line automatically.
 */
@Injectable({ scope: Scope.DEFAULT })
export class AppLogger implements LoggerService {
  readonly root: Logger;

  constructor(config: AppConfig) {
    this.root = pino({
      level: config.logLevel,
      base: { service: 'api' },
      mixin: () => {
        const traceId = currentTraceId();
        return traceId ? { traceId } : {};
      },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', '*.apiKey', '*.ANTHROPIC_API_KEY'],
        censor: '[redacted]',
      },
      ...(config.isProduction
        ? {}
        : {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service' },
            },
          }),
    });
  }

  /** Child logger bound to a component name, e.g. logger.forContext('ChunkingService'). */
  forContext(context: string): Logger {
    return this.root.child({ context });
  }

  log(message: unknown, context?: string): void {
    this.root.info({ context }, String(message));
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.root.error({ context, stack }, String(message));
  }

  warn(message: unknown, context?: string): void {
    this.root.warn({ context }, String(message));
  }

  debug(message: unknown, context?: string): void {
    this.root.debug({ context }, String(message));
  }

  verbose(message: unknown, context?: string): void {
    this.root.trace({ context }, String(message));
  }
}
