export interface McpConfig {
  /** Base URL of the running Code Documentation Assistant API, without a trailing slash. */
  apiUrl: string;
  /** Per-request timeout. Generous by default: a CPU-only local LLM can take minutes to answer. */
  requestTimeoutMs: number;
  /** How long index_repository waits for indexing to finish before returning. */
  indexTimeoutMs: number;
  /** How often index_repository checks indexing status while waiting. */
  pollIntervalMs: number;
}

export const DEFAULT_API_URL = 'http://localhost:3001';

function positiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}".`);
  }
  return value;
}

function apiUrl(raw: string | undefined): string {
  const value = (raw ?? DEFAULT_API_URL).trim();
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new Error('unsupported protocol');
  } catch {
    throw new Error(`REPO_SCRAPPER_API_URL must be an http(s) URL, got "${value}".`);
  }
  return value.replace(/\/+$/, '');
}

/** Reads and validates configuration from the environment. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  return {
    apiUrl: apiUrl(env.REPO_SCRAPPER_API_URL),
    requestTimeoutMs: positiveInt(
      'REPO_SCRAPPER_REQUEST_TIMEOUT_MS',
      env.REPO_SCRAPPER_REQUEST_TIMEOUT_MS,
      300_000,
    ),
    indexTimeoutMs: positiveInt(
      'REPO_SCRAPPER_INDEX_TIMEOUT_MS',
      env.REPO_SCRAPPER_INDEX_TIMEOUT_MS,
      600_000,
    ),
    pollIntervalMs: positiveInt(
      'REPO_SCRAPPER_POLL_INTERVAL_MS',
      env.REPO_SCRAPPER_POLL_INTERVAL_MS,
      3_000,
    ),
  };
}
