import type { ArgumentsHost } from '@nestjs/common';
import { createFakeLogger } from '../../../test/helpers/fake-logger';
import { RepositoryNotFoundError } from '../errors/domain-errors';
import { runWithTrace } from '../logging/trace-context';
import { AllExceptionsFilter } from './all-exceptions.filter';

function fakeHost() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', originalUrl: '/repositories/r1/ask' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  it('writes the mapped status and body for a domain error', () => {
    const logger = createFakeLogger();
    const { host, status, json } = fakeHost();

    new AllExceptionsFilter(logger).catch(new RepositoryNotFoundError('r1'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ statusCode: 404, message: 'Repository r1 not found' });
    expect(logger.logs.error).not.toHaveBeenCalled();
  });

  it('logs server errors with their stack but returns a generic message', () => {
    const logger = createFakeLogger();
    const { host, status, json } = fakeHost();

    new AllExceptionsFilter(logger).catch(new Error('db exploded'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ statusCode: 500, message: 'Internal server error' });
    expect(logger.logs.error).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        path: '/repositories/r1/ask',
        err: expect.objectContaining({ message: 'db exploded', stack: expect.any(String) }),
      }),
      'request failed',
    );
  });

  it('includes the active trace id in the body', () => {
    const { host, json } = fakeHost();
    runWithTrace('trace-123', () =>
      new AllExceptionsFilter(createFakeLogger()).catch(new RepositoryNotFoundError('r1'), host),
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ traceId: 'trace-123' }));
  });
});
