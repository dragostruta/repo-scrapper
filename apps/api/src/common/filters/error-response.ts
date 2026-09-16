import { HttpException, HttpStatus } from '@nestjs/common';
import { DomainError, type DomainErrorKind } from '../errors/domain-errors';

export interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
}

const STATUS_BY_KIND: Record<DomainErrorKind, HttpStatus> = {
  invalid_input: HttpStatus.BAD_REQUEST,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  payload_too_large: HttpStatus.PAYLOAD_TOO_LARGE,
  upstream_unavailable: HttpStatus.SERVICE_UNAVAILABLE,
};

/**
 * Turns anything thrown during a request into the API's single error shape.
 * Domain errors and HttpExceptions keep their message; anything else is an
 * unexpected failure whose message is never shown to the client.
 */
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof DomainError) {
    return { statusCode: STATUS_BY_KIND[exception.kind], message: exception.message };
  }
  if (exception instanceof HttpException) {
    return fromHttpException(exception);
  }
  return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
}

function fromHttpException(exception: HttpException): ErrorResponse {
  const statusCode = exception.getStatus();
  const payload = exception.getResponse();
  if (typeof payload === 'string') return { statusCode, message: payload };

  const { message, error } = payload as { message?: string | string[]; error?: string };
  return {
    statusCode,
    message: Array.isArray(message) ? message.join('; ') : (message ?? exception.message),
    ...(error ? { error } : {}),
  };
}
