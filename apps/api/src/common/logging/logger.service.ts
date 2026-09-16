import { Injectable, LoggerService } from '@nestjs/common';
import pino, { type Logger, type LoggerOptions } from 'pino';
import { AppConfig } from '../../config/app-config';
import { currentTraceId } from './trace-context';

export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.apiKey',
  '*.ANTHROPIC_API_KEY',
];

/**
 * pino settings: JSON in production, pretty-printed in development, the
 * active trace id mixed into every line, and secrets redacted.
 */
export function buildLoggerOptions(
  config: Pick<AppConfig, 'logLevel' | 'isProduction'>,
): LoggerOptions {
  return {
    level: config.logLevel,
    base: { service: 'api' },
    mixin: () => {
      const traceId = currentTraceId();
      return traceId ? { traceId } : {};
    },
    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
    ...(config.isProduction
      ? {}
      : {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname,service',
            },
          },
        }),
  };
}

/**
 * Nest's LoggerService backed by pino, so framework logs and application
 * logs share one structured, trace-correlated stream.
 */
@Injectable()
export class AppLogger implements LoggerService {
  readonly root: Logger;

  constructor(config: AppConfig) {
    this.root = pino(buildLoggerOptions(config));
  }

  /** Child logger bound to a component name, e.g. `logger.forContext('ChunkerService')`. */
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
