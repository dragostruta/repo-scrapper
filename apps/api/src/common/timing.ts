/**
 * Starts a monotonic timer. Call the returned function to read the elapsed
 * whole milliseconds; it can be called more than once.
 */
export function startTimer(): () => number {
  const startedAt = process.hrtime.bigint();
  return () => Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6);
}
