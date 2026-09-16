import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { AppLogger } from '../common/logging/logger.service';
import type { ParsedGithubRepo } from './parse-github-url';
import { RepositoryTooLargeError } from './ingest.errors';

const execFileAsync = promisify(execFile);

export interface ClonedRepo {
  /** Directory containing the checked-out worktree. Caller owns cleanup. */
  dir: string;
  /** Short commit sha of HEAD after the shallow clone. */
  revision: string;
}

/**
 * Shallow-clones a public GitHub repository into a throwaway directory under
 * WORKSPACE_DIR. Every guardrail from the README's "Ingest safety" section
 * lives here: HTTPS-only and host-allowlisted (enforced earlier, in
 * parseGithubUrl), a hard clone timeout, --depth 1, no credential helpers, and
 * a post-clone size check that deletes and rejects an oversized checkout
 * rather than letting it sit on disk.
 */
@Injectable()
export class GithubClonerService {
  private readonly logger;

  constructor(
    private readonly config: AppConfig,
    logger: AppLogger,
  ) {
    this.logger = logger.forContext('GithubClonerService');
  }

  /** workspaceDir is a bind-mounted volume in Docker but may not exist yet on
   * a fresh local checkout, and mkdtemp requires its parent to already exist. */
  async clone(repo: ParsedGithubRepo): Promise<ClonedRepo> {
    const { workspaceDir, cloneTimeoutMs, maxRepoSizeBytes } = this.config.ingest;
    await mkdir(workspaceDir, { recursive: true });
    const parent = await mkdtemp(join(workspaceDir, 'clone-'));
    const dir = join(parent, 'repo');

    try {
      await execFileAsync(
        'git',
        ['clone', '--depth', '1', '--single-branch', '--no-tags', '--', repo.cloneUrl, dir],
        {
          timeout: cloneTimeoutMs,
          env: {
            ...process.env,
            // Fail fast instead of hanging on an auth prompt for a private/nonexistent repo.
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: 'echo',
          },
        },
      );
    } catch (err) {
      await rm(parent, { recursive: true, force: true });
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ repo: repo.name, err: message }, 'clone failed');
      throw new RepositoryTooLargeError(
        `Could not clone ${repo.name}. It may not exist, be private, or the clone exceeded ` +
          `the ${cloneTimeoutMs}ms timeout.`,
      );
    }

    const sizeBytes = await this.dirSize(dir);
    if (sizeBytes > maxRepoSizeBytes) {
      await rm(parent, { recursive: true, force: true });
      throw new RepositoryTooLargeError(
        `${repo.name} is ${Math.round(sizeBytes / 1024 / 1024)}MB, over the ` +
          `${Math.round(maxRepoSizeBytes / 1024 / 1024)}MB limit.`,
      );
    }

    // Full sha, not --short: must compare equal to resolveHeadSha()'s cache-check value.
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: dir });
    const revision = stdout.trim();

    this.logger.info({ repo: repo.name, revision, sizeBytes }, 'clone completed');
    return { dir, revision };
  }

  /**
   * Cheap pre-clone cache probe: asks the remote for HEAD without fetching
   * any objects. Lets the orchestrator skip an entire clone+index cycle for
   * a repository already indexed at the current commit. Returns null rather
   * than throwing on failure - the orchestrator falls back to cloning
   * unconditionally, which is always correct, just slower.
   */
  async resolveHeadSha(cloneUrl: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['ls-remote', cloneUrl, 'HEAD'], {
        timeout: 15_000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' },
      });
      const sha = stdout.split(/\s+/)[0]?.trim();
      return sha && /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
    } catch (err) {
      this.logger.warn(
        { cloneUrl, err: err instanceof Error ? err.message : String(err) },
        'could not resolve HEAD sha before cloning - cache check skipped',
      );
      return null;
    }
  }

  /** clonedDir is .../clone-XXXXXX/repo - removes the whole temp parent. */
  async cleanup(clonedDir: string): Promise<void> {
    await rm(join(clonedDir, '..'), { recursive: true, force: true });
  }

  private async dirSize(dir: string): Promise<number> {
    const { readdir, stat } = await import('node:fs/promises');
    let total = 0;
    const stack = [dir];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.git') continue; // shallow clone metadata, not repo content
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile()) {
          total += (await stat(full)).size;
        }
      }
    }
    return total;
  }
}
