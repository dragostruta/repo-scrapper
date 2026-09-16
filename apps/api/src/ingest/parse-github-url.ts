import { InvalidRepositorySourceError } from '../common/errors/domain-errors';

export interface ParsedGithubRepo {
  /** Canonical https clone URL, always ending in .git. */
  cloneUrl: string;
  /** "owner/name" - used as the cache key and displayed in the UI. */
  name: string;
  host: string;
}

const SAFE_SEGMENT = /^[\w.-]+$/;

/**
 * Accepts the URL shapes people actually paste (https://github.com/owner/repo,
 * .../repo.git, .../repo/, .../repo/tree/main) from an allowed host, and
 * rejects everything else with a message that says why.
 */
export function parseGithubUrl(input: string, allowedHosts: readonly string[]): ParsedGithubRepo {
  const url = toUrl(input);
  assertHttps(url);
  const host = assertAllowedHost(url, allowedHosts);
  const { owner, repo } = extractOwnerAndRepo(url);

  return {
    cloneUrl: `https://${host}/${owner}/${repo}.git`,
    name: `${owner}/${repo}`,
    host,
  };
}

function toUrl(input: string): URL {
  try {
    return new URL(input.trim());
  } catch {
    throw new InvalidRepositorySourceError(`"${input}" is not a valid URL.`);
  }
}

function assertHttps(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new InvalidRepositorySourceError('Only https:// repository URLs are accepted.');
  }
}

function assertAllowedHost(url: URL, allowedHosts: readonly string[]): string {
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.includes(host)) {
    throw new InvalidRepositorySourceError(
      `"${host}" is not an allowed repository host. Allowed: ${allowedHosts.join(', ')}.`,
    );
  }
  return host;
}

function extractOwnerAndRepo(url: URL): { owner: string; repo: string } {
  const [owner, rawRepo] = url.pathname.split('/').filter(Boolean);
  if (!owner || !rawRepo) {
    throw new InvalidRepositorySourceError(
      'Expected a repository URL like https://github.com/owner/repo.',
    );
  }

  const repo = rawRepo.replace(/\.git$/, '');
  if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(repo)) {
    throw new InvalidRepositorySourceError('Repository owner/name contains unexpected characters.');
  }
  return { owner, repo };
}
