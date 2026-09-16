import { currentTraceId, newTraceId, runWithTrace } from './trace-context';

describe('trace context', () => {
  it('has no trace id outside a trace scope', () => {
    expect(currentTraceId()).toBeUndefined();
  });

  it('exposes the id inside the scope, including across awaits', async () => {
    await runWithTrace('outer', async () => {
      await Promise.resolve();
      expect(currentTraceId()).toBe('outer');
    });
    expect(currentTraceId()).toBeUndefined();
  });

  it('lets a nested scope shadow the outer id, then restores it', () => {
    runWithTrace('outer', () => {
      runWithTrace('inner', () => expect(currentTraceId()).toBe('inner'));
      expect(currentTraceId()).toBe('outer');
    });
  });

  it('returns the callback result', () => {
    expect(runWithTrace('t', () => 42)).toBe(42);
  });

  it('mints unique UUIDs', () => {
    const a = newTraceId();
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(newTraceId()).not.toBe(a);
  });
});
