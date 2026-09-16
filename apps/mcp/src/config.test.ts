import { describe, expect, it } from 'vitest';
import { DEFAULT_API_URL, readConfig } from './config.js';

describe('readConfig', () => {
  it('defaults to the local API with generous timeouts', () => {
    expect(readConfig({})).toEqual({
      apiUrl: DEFAULT_API_URL,
      requestTimeoutMs: 300_000,
      indexTimeoutMs: 600_000,
      pollIntervalMs: 3_000,
    });
  });

  it('reads overrides and strips trailing slashes from the URL', () => {
    const config = readConfig({
      REPO_SCRAPPER_API_URL: ' https://docs.example.com/api/// ',
      REPO_SCRAPPER_REQUEST_TIMEOUT_MS: '1000',
      REPO_SCRAPPER_INDEX_TIMEOUT_MS: '2000',
      REPO_SCRAPPER_POLL_INTERVAL_MS: '50',
    });
    expect(config).toEqual({
      apiUrl: 'https://docs.example.com/api',
      requestTimeoutMs: 1000,
      indexTimeoutMs: 2000,
      pollIntervalMs: 50,
    });
  });

  it('treats an empty number as unset', () => {
    expect(readConfig({ REPO_SCRAPPER_POLL_INTERVAL_MS: '' }).pollIntervalMs).toBe(3_000);
  });

  it.each(['not a url', 'ftp://example.com', ''])('rejects API URL %j', (value) => {
    expect(() => readConfig({ REPO_SCRAPPER_API_URL: value })).toThrow(/REPO_SCRAPPER_API_URL/);
  });

  it.each(['0', '-5', '1.5', 'soon'])('rejects timeout %j', (value) => {
    expect(() => readConfig({ REPO_SCRAPPER_REQUEST_TIMEOUT_MS: value })).toThrow(
      /REPO_SCRAPPER_REQUEST_TIMEOUT_MS must be a positive integer/,
    );
  });
});
