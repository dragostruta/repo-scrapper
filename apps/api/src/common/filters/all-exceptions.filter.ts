import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError } from '@app/shared';
import { AppLogger } from '../logging/logger.service';
import { currentTraceId } from '../logging/trace-context';
import { toErrorResponse } from './error-response';

/**
 * Every error leaves the API in the same shape, and every 5xx is logged with
 * its stack and trace id. The trace id in the body is the handle for finding
 * that log line - the client never sees an unexpected error's message.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = toErrorResponse(exception);

    if (response.statusCode >= 500) {
      this.logServerError(exception, http.getRequest<Request>(), response.statusCode);
    }

    const traceId = currentTraceId();
    const body: ApiError & { traceId?: string } = { ...response, ...(traceId ? { traceId } : {}) };
    http.getResponse<Response>().status(response.statusCode).json(body);
  }

  private logServerError(exception: unknown, req: Request, status: number): void {
    this.logger.root.error(
      {
        context: 'exception',
        method: req.method,
        path: req.originalUrl,
        status,
        err:
          exception instanceof Error
            ? { message: exception.message, stack: exception.stack }
            : exception,
      },
      'request failed',
    );
  }
}
