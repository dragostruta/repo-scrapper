/**
 * Runs at most `limit` tasks at once; the rest wait their turn in FIFO order.
 *
 * Indexing is the expensive path in this service - a clone, then an embedding
 * pass over every chunk - and it runs in-process (D8). Without a limit, N
 * simultaneous requests means N simultaneous clones and N embedding workloads
 * competing in one Node process, which is how a service stops answering
 * questions because someone pasted five repository URLs.
 *
 * "No queue" and "no limit" are different choices. This is the second half of
 * the first one: the work still happens in-process, it just does not all
 * happen at once.
 *
 * The queue is in memory, so a restart loses whatever had not started yet.
 * That is why IngestOrchestratorService.recoverInterruptedIndexing treats a
 * PENDING row on boot the same as an interrupted one.
 */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`Semaphore limit must be a positive integer, got ${limit}`);
    }
  }

  /** Currently running tasks. */
  get activeCount(): number {
    return this.active;
  }

  /** Tasks admitted but not started. */
  get queuedCount(): number {
    return this.waiting.length;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
  }

  private release(): void {
    this.active--;
    this.waiting.shift()?.();
  }
}
