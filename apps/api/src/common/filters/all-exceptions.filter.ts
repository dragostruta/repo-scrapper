import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError } from '@app/shared';
import { AppLogger } from '../logging/logger.service';
import { currentTraceId } from '../logging/trace-context';

/**
 * Every error leaves the API in the same shape, and every 5xx is logged with a
 * stack and the trace id. Unexpected errors never leak their message to the
 * client - the trace id is the handle for looking it up in the logs.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string;
    let error: string | undefined;

    if (isHttp) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else {
        const obj = payload as { message?: string | string[]; error?: string };
        message = Array.isArray(obj.message)
          ? obj.message.join('; ')
          : (obj.message ?? exception.message);
        error = obj.error;
      }
    } else {
      message = 'Internal server error';
    }

    if (status >= 500) {
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
        'unhandled exception',
      );
    }

    const body: ApiError & { traceId?: string } = {
      statusCode: status,
      message,
      ...(error ? { error } : {}),
      ...(currentTraceId() ? { traceId: currentTraceId() } : {}),
    };

    res.status(status).json(body);
  }
}
