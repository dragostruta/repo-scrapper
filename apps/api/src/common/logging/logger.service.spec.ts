import type { AppConfig } from '../../config/app-config';
import { AppLogger, buildLoggerOptions, REDACTED_PATHS } from './logger.service';
import { runWithTrace } from './trace-context';

const productionConfig = { logLevel: 'info', isProduction: true } as AppConfig;

describe('buildLoggerOptions', () => {
  it('uses the configured level and redacts secrets', () => {
    const options = buildLoggerOptions({ logLevel: 'warn', isProduction: true });
    expect(options.level).toBe('warn');
    expect(options.redact).toEqual({ paths: REDACTED_PATHS, censor: '[redacted]' });
    expect(REDACTED_PATHS).toContain('*.ANTHROPIC_API_KEY');
  });

  it('writes plain JSON in production and pretty output in development', () => {
    expect(buildLoggerOptions({ logLevel: 'info', isProduction: true }).transport).toBeUndefined();
    expect(buildLoggerOptions({ logLevel: 'info', isProduction: false }).transport).toMatchObject({
      target: 'pino-pretty',
    });
  });

  it('mixes the active trace id into every line, and nothing outside a trace', () => {
    const { mixin } = buildLoggerOptions(productionConfig);
    const call = () => (mixin as () => object)();
    expect(call()).toEqual({});
    expect(runWithTrace('trace-1', call)).toEqual({ traceId: 'trace-1' });
  });
});

describe('AppLogger', () => {
  const build = () => {
    const logger = new AppLogger(productionConfig);
    for (const level of ['info', 'error', 'warn', 'debug', 'trace'] as const) {
      jest.spyOn(logger.root, level).mockImplementation(() => undefined);
    }
    return logger;
  };

  it('binds a context name to child loggers', () => {
    const logger = new AppLogger(productionConfig);
    expect(logger.forContext('ChunkerService').bindings()).toMatchObject({
      context: 'ChunkerService',
    });
  });

  it('routes Nest logger calls to the matching pino level', () => {
    const logger = build();

    logger.log('booted', 'Bootstrap');
    logger.error('failed', 'stack-trace', 'Db');
    logger.warn('slow', 'Http');
    logger.debug('detail');
    logger.verbose('noise');

    expect(logger.root.info).toHaveBeenCalledWith({ context: 'Bootstrap' }, 'booted');
    expect(logger.root.error).toHaveBeenCalledWith(
      { context: 'Db', stack: 'stack-trace' },
      'failed',
    );
    expect(logger.root.warn).toHaveBeenCalledWith({ context: 'Http' }, 'slow');
    expect(logger.root.debug).toHaveBeenCalledWith({ context: undefined }, 'detail');
    expect(logger.root.trace).toHaveBeenCalledWith({ context: undefined }, 'noise');
  });

  it('stringifies non-string messages', () => {
    const logger = build();
    logger.log(42);
    expect(logger.root.info).toHaveBeenCalledWith({ context: undefined }, '42');
  });
});
