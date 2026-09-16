import { startTimer } from './timing';

describe('startTimer', () => {
  it('reports whole, non-negative milliseconds that never go backwards', async () => {
    const elapsed = startTimer();
    const first = elapsed();
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = elapsed();

    expect(Number.isInteger(first)).toBe(true);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThanOrEqual(first);
    expect(second).toBeGreaterThanOrEqual(10);
  });
});
