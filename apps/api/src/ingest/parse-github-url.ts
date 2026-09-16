import { InvalidRepositorySourceError } from './ingest.errors';

export interface ParsedGithubRepo {
  /** Canonical https clone URL, always ending in .git. */
  cloneUrl: string;
  /** "owner/name" - used as the cache key and displayed in the UI. */
  name: string;
  host: string;
}

/**
 * Accepts the handful of URL shapes people actually paste
 * (https://github.com/owner/repo, .../repo.git, .../repo/, .../repo/tree/main)
 * and rejects everything else. This runs before the host allowlist check, so
 * it never needs to know what hosts are configured - that check happens
 * separately against AppConfig.
 */
export function parseGithubUrl(input: string, allowedHosts: string[]): ParsedGithubRepo {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new InvalidRepositorySourceError(`"${input}" is not a valid URL.`);
  }

  if (url.protocol !== 'https:') {
    throw new InvalidRepositorySourceError('Only https:// repository URLs are accepted.');
  }

  const host = url.hostname.toLowerCase();
  if (!allowedHosts.includes(host)) {
    throw new InvalidRepositorySourceError(
      `"${host}" is not an allowed repository host. Allowed: ${allowedHosts.join(', ')}.`,
    );
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 2) {
    throw new InvalidRepositorySourceError(
      'Expected a repository URL like https://github.com/owner/repo.',
    );
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, '');

  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    throw new InvalidRepositorySourceError('Repository owner/name contains unexpected characters.');
  }

  return {
    cloneUrl: `https://${host}/${owner}/${repo}.git`,
    name: `${owner}/${repo}`,
    host,
  };
}
