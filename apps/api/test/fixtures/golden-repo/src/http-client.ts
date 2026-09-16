export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * Thin wrapper around fetch that adds a timeout and retries exactly once on
 * a network error - used by every outbound HTTP call in this service.
 */
export async function fetchWithRetry(url: string, options: FetchOptions = {}): Promise<Response> {
  try {
    return await fetchWithTimeout(url, options);
  } catch {
    return await fetchWithTimeout(url, options);
  }
}

async function fetchWithTimeout(url: string, options: FetchOptions): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    return await fetch(url, { headers: options.headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
