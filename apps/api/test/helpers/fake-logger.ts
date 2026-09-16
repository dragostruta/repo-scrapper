import type { AppLogger } from '../../src/common/logging/logger.service';

export interface FakeLogs {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
}

/**
 * An AppLogger stand-in. `root` and every `forContext()` child share one set
 * of mocks (`logs`), so a test can assert on `logger.logs.warn` regardless of
 * which context a class logged under. The Nest LoggerService methods are
 * no-ops, so a booted Nest app can log through it too.
 */
export function createFakeLogger(): AppLogger & { logs: FakeLogs } {
  const logs: FakeLogs = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return {
    logs,
    root: logs,
    forContext: () => logs,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  } as unknown as AppLogger & { logs: FakeLogs };
}
