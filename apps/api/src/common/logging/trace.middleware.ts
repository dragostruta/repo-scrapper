import type { NextFunction, Request, Response } from 'express';
import { AppLogger } from './logger.service';
import { newTraceId, runWithTrace } from './trace-context';

const TRACE_HEADER = 'x-trace-id';

/**
 * Plain Express middleware rather than a NestMiddleware class: it is applied
 * once in main.ts with app.use(), which sidesteps the route-pattern syntax
 * differences between Express 4 and 5 entirely.
 *
 * It opens the trace scope, echoes the id back on the response so a user can
 * quote it in a bug report, and logs one structured line per completed request.
 */
export function createTraceMiddleware(logger: AppLogger) {
  return function traceMiddleware(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(TRACE_HEADER);
    const traceId = incoming && incoming.length <= 128 ? incoming : newTraceId();
    res.setHeader(TRACE_HEADER, traceId);

    const startedAt = process.hrtime.bigint();

    runWithTrace(traceId, () => {
      res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        logger.root.info(
          {
            context: 'http',
            traceId,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            durationMs: Math.round(durationMs),
          },
          'request completed',
        );
      });
      next();
    });
  };
}
