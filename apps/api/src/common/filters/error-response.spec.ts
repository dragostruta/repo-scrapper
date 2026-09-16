import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import {
  InvalidRepositorySourceError,
  LlmUnavailableError,
  RepositoryNotFoundError,
  RepositoryNotReadyError,
  RepositoryTooLargeError,
} from '../errors/domain-errors';
import { toErrorResponse } from './error-response';

describe('toErrorResponse', () => {
  it.each([
    [new InvalidRepositorySourceError('bad url'), 400],
    [new RepositoryNotFoundError('r1'), 404],
    [new RepositoryNotReadyError('INDEXING'), 409],
    [new RepositoryTooLargeError('too big'), 413],
    [new LlmUnavailableError('ollama down'), 503],
  ])('maps %s to HTTP %i and keeps its message', (error, status) => {
    expect(toErrorResponse(error)).toEqual({ statusCode: status, message: error.message });
  });

  it('keeps a string HttpException payload as the message', () => {
    expect(toErrorResponse(new HttpException('teapot', 418))).toEqual({
      statusCode: 418,
      message: 'teapot',
    });
  });

  it('joins validation messages and keeps the error label', () => {
    const validation = new BadRequestException([
      'question should not be empty',
      'url must be a URL',
    ]);
    expect(toErrorResponse(validation)).toEqual({
      statusCode: 400,
      message: 'question should not be empty; url must be a URL',
      error: 'Bad Request',
    });
  });

  it('falls back to the exception message when the payload has none', () => {
    const exception = new HttpException({ error: 'Custom' }, HttpStatus.FORBIDDEN);
    expect(toErrorResponse(exception)).toMatchObject({ statusCode: 403, error: 'Custom' });
  });

  it('keeps a plain NotFoundException message', () => {
    expect(toErrorResponse(new NotFoundException('nope')).message).toBe('nope');
  });

  it('never leaks the message of an unexpected error', () => {
    const response = toErrorResponse(new Error('password=hunter2 in stack'));
    expect(response).toEqual({ statusCode: 500, message: 'Internal server error' });
  });

  it('treats a thrown non-Error value as an internal error', () => {
    expect(toErrorResponse('just a string').statusCode).toBe(500);
    expect(toErrorResponse(undefined).statusCode).toBe(500);
  });
});
