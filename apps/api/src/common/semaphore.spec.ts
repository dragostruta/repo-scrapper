import { Semaphore } from './semaphore';

/** Lets every pending microtask and timer callback settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A promise plus the handle to settle it, so a test can hold tasks open. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('Semaphore', () => {
  it('rejects a limit that would let nothing run', () => {
    expect(() => new Semaphore(0)).toThrow(/positive integer/);
    expect(() => new Semaphore(1.5)).toThrow(/positive integer/);
  });

  it('runs up to the limit at once and makes the rest wait', async () => {
    const semaphore = new Semaphore(2);
    const gates = [deferred(), deferred(), deferred()];
    let started = 0;

    const runs = gates.map((gate) =>
      semaphore.run(async () => {
        started++;
        await gate.promise;
      }),
    );

    await flush();
    expect(started).toBe(2);
    expect(semaphore.queuedCount).toBe(1);

    gates[0].resolve();
    await runs[0];
    await flush();
    expect(started).toBe(3);

    gates[1].resolve();
    gates[2].resolve();
    await Promise.all(runs);
    expect(semaphore.activeCount).toBe(0);
  });

  it('frees its slot when a task throws, so one failure cannot wedge the queue', async () => {
    const semaphore = new Semaphore(1);

    await expect(semaphore.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(semaphore.activeCount).toBe(0);
    await expect(semaphore.run(() => Promise.resolve('next'))).resolves.toBe('next');
  });

  it('admits waiting tasks in the order they arrived', async () => {
    const semaphore = new Semaphore(1);
    const order: number[] = [];
    const first = deferred();

    const runs = [
      semaphore.run(async () => {
        order.push(0);
        await first.promise;
      }),
      semaphore.run(() => Promise.resolve(order.push(1))),
      semaphore.run(() => Promise.resolve(order.push(2))),
    ];

    first.resolve();
    await Promise.all(runs);
    expect(order).toEqual([0, 1, 2]);
  });

  it('returns the task result to its own caller', async () => {
    const semaphore = new Semaphore(2);
    await expect(
      Promise.all([semaphore.run(async () => 'a'), semaphore.run(async () => 'b')]),
    ).resolves.toEqual(['a', 'b']);
  });
});
