import { EventEmitter } from 'node:events';
import type { NextFunction, Request, Response } from 'express';
import { createFakeLogger } from '../../../test/helpers/fake-logger';
import { currentTraceId } from './trace-context';
import { createTraceMiddleware, resolveTraceId, TRACE_HEADER } from './trace.middleware';

describe('resolveTraceId', () => {
  it('reuses a caller-supplied id', () => {
    expect(resolveTraceId('client-trace')).toBe('client-trace');
  });

  it('mints a new id when none is supplied', () => {
    expect(resolveTraceId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveTraceId('')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses an oversized id rather than echoing it back', () => {
    expect(resolveTraceId('x'.repeat(129))).not.toBe('x'.repeat(129));
    expect(resolveTraceId('x'.repeat(128))).toBe('x'.repeat(128));
  });
});

describe('createTraceMiddleware', () => {
  function run(incomingHeader?: string) {
    const logger = createFakeLogger();
    const res = Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      statusCode: 201,
    }) as unknown as Response & EventEmitter;
    const req = {
      header: (name: string) => (name === TRACE_HEADER ? incomingHeader : undefined),
      method: 'POST',
      originalUrl: '/repositories',
    } as unknown as Request;
    let traceInsideNext: string | undefined;
    const next: NextFunction = () => {
      traceInsideNext = currentTraceId();
    };

    createTraceMiddleware(logger)(req, res, next);
    return { logger, res, traceInsideNext };
  }

  it('echoes the trace id and runs the rest of the request inside it', () => {
    const { res, traceInsideNext } = run('abc');
    expect(res.setHeader).toHaveBeenCalledWith(TRACE_HEADER, 'abc');
    expect(traceInsideNext).toBe('abc');
  });

  it('logs one line when the response finishes, not before', () => {
    const { logger, res } = run('abc');
    expect(logger.logs.info).not.toHaveBeenCalled();

    res.emit('finish');

    expect(logger.logs.info).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'abc',
        method: 'POST',
        path: '/repositories',
        status: 201,
        durationMs: expect.any(Number),
      }),
      'request completed',
    );
  });
});
