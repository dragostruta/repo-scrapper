export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  level: LogLevel;
  service: string;
}

/**
 * Builds a structured JSON logger for a background worker process - each
 * line carries the service name and a monotonically increasing sequence
 * number so log aggregation can detect gaps caused by a crashed worker.
 */
export function createWorkerLogger(options: LoggerOptions) {
  let sequence = 0;
  return {
    log(level: LogLevel, message: string): void {
      sequence += 1;
      process.stdout.write(
        `${JSON.stringify({ service: options.service, level, message, sequence })}\n`,
      );
    },
  };
}
