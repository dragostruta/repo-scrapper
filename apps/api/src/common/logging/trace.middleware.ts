import type { NextFunction, Request, Response } from 'express';
import { startTimer } from '../timing';
import { AppLogger } from './logger.service';
import { newTraceId, runWithTrace } from './trace-context';

export const TRACE_HEADER = 'x-trace-id';
const MAX_TRACE_ID_LENGTH = 128;

/** Reuses a caller-supplied trace id when it's sane, otherwise mints one. */
export function resolveTraceId(incoming: string | undefined): string {
  return incoming && incoming.length <= MAX_TRACE_ID_LENGTH ? incoming : newTraceId();
}

/**
 * Plain Express middleware (applied once with app.use()) rather than a
 * NestMiddleware class, which sidesteps Express 4/5 route-pattern differences.
 * Opens the trace scope, echoes the id on the response so users can quote it,
 * and logs one structured line per completed request.
 */
export function createTraceMiddleware(logger: AppLogger) {
  return function traceMiddleware(req: Request, res: Response, next: NextFunction): void {
    const traceId = resolveTraceId(req.header(TRACE_HEADER));
    res.setHeader(TRACE_HEADER, traceId);
    const elapsed = startTimer();

    runWithTrace(traceId, () => {
      res.on('finish', () =>
        logger.root.info(
          {
            context: 'http',
            traceId,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            durationMs: elapsed(),
          },
          'request completed',
        ),
      );
      next();
    });
  };
}
