import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { AppLogger } from '../common/logging/logger.service';
import { RepositoryCloneError, RepositoryTooLargeError } from '../common/errors/domain-errors';
import { errorMessage } from '../common/errors/error-message';
import { directorySize } from './directory-size';
import { GitClient } from './git.client';
import type { ParsedGithubRepo } from './parse-github-url';

export interface ClonedRepo {
  /** Directory containing the checked-out worktree. Caller owns cleanup. */
  dir: string;
  /** Full commit sha of HEAD after the shallow clone. */
  revision: string;
}

const HEAD_PROBE_TIMEOUT_MS = 15_000;
const BYTES_PER_MB = 1024 * 1024;
const CLONE_METADATA_DIRS: ReadonlySet<string> = new Set(['.git']);

/** How often the growing clone is measured while git is still running. */
const SIZE_POLL_INTERVAL_MS = 1_000;

/**
 * The watchdog measures everything on disk, `.git` included, while the final
 * size check measures repository content only. A shallow clone holds the
 * content twice - packed under `.git` and checked out in the worktree - so the
 * disk ceiling is the content limit doubled. Without that headroom a
 * repository sitting just under the limit would be killed for its own pack
 * file.
 */
const DISK_HEADROOM_MULTIPLIER = 2;

/** Nothing is skipped when measuring disk usage: `.git` is most of it. */
const NOTHING_SKIPPED: ReadonlySet<string> = new Set();

interface CloneWatchdog {
  /** True once the clone was aborted for exceeding the disk ceiling. */
  readonly tripped: boolean;
  stop(): void;
}

/**
 * Shallow-clones a public GitHub repository into a throwaway directory under
 * WORKSPACE_DIR. Guardrails live here: HTTPS + host allowlist (enforced
 * earlier by parseGithubUrl), a hard timeout, --depth 1, no credential
 * prompts, and a post-clone size check. Any failure removes the temp
 * directory before rethrowing, so nothing is ever left on disk.
 */
@Injectable()
export class GithubClonerService {
  private readonly logger;

  constructor(
    private readonly config: AppConfig,
    private readonly git: GitClient,
    logger: AppLogger,
  ) {
    this.logger = logger.forContext('GithubClonerService');
  }

  async clone(repo: ParsedGithubRepo): Promise<ClonedRepo> {
    const workspace = await this.createWorkspace();
    const dir = join(workspace, 'repo');

    try {
      await this.fetchWorkingTree(repo, dir);
      const sizeBytes = await this.assertWithinSizeLimit(repo, dir);
      const revision = await this.git.headSha(dir);
      this.logger.info({ repo: repo.name, revision, sizeBytes }, 'clone completed');
      return { dir, revision };
    } catch (err) {
      await rm(workspace, { recursive: true, force: true });
      throw err;
    }
  }

  /**
   * Cheap pre-clone cache probe. Returns null instead of throwing so the
   * caller simply falls back to cloning, which is always correct, just slower.
   */
  async resolveHeadSha(cloneUrl: string): Promise<string | null> {
    try {
      return await this.git.remoteHeadSha(cloneUrl, HEAD_PROBE_TIMEOUT_MS);
    } catch (err) {
      this.logger.warn(
        { cloneUrl, err: errorMessage(err) },
        'could not resolve HEAD sha before cloning - cache check skipped',
      );
      return null;
    }
  }

  /** `clonedDir` is `.../clone-XXXXXX/repo`; removes the whole temp parent. */
  async cleanup(clonedDir: string): Promise<void> {
    await rm(dirname(clonedDir), { recursive: true, force: true });
  }

  /** mkdtemp needs its parent to exist, which it won't on a fresh checkout. */
  private async createWorkspace(): Promise<string> {
    const { workspaceDir } = this.config.ingest;
    await mkdir(workspaceDir, { recursive: true });
    return mkdtemp(join(workspaceDir, 'clone-'));
  }

  private async fetchWorkingTree(repo: ParsedGithubRepo, dir: string): Promise<void> {
    const { cloneTimeoutMs, maxRepoSizeBytes } = this.config.ingest;
    const controller = new AbortController();
    const watchdog = this.abortWhenOversized(dir, maxRepoSizeBytes, controller);

    try {
      await this.git.shallowClone(repo.cloneUrl, dir, {
        timeoutMs: cloneTimeoutMs,
        signal: controller.signal,
      });
    } catch (err) {
      if (watchdog.tripped) {
        this.logger.warn({ repo: repo.name }, 'clone aborted - repository outgrew the size limit');
        throw new RepositoryTooLargeError(
          `${repo.name} passed the ${Math.round(maxRepoSizeBytes / BYTES_PER_MB)}MB limit while ` +
            `cloning, so the clone was stopped before it finished.`,
        );
      }
      this.logger.warn({ repo: repo.name, err: errorMessage(err) }, 'clone failed');
      throw new RepositoryCloneError(
        `Could not clone ${repo.name}. It may not exist, be private, or the clone exceeded ` +
          `the ${cloneTimeoutMs}ms timeout.`,
      );
    } finally {
      watchdog.stop();
    }
  }

  /**
   * Polls the clone directory while git runs and aborts as soon as it crosses
   * the disk ceiling. A shallow clone with a timeout still lets a very large
   * repository write for the whole timeout window, so the size limit has to be
   * enforced during the clone, not only after it.
   */
  private abortWhenOversized(
    dir: string,
    maxContentBytes: number,
    controller: AbortController,
  ): CloneWatchdog {
    const ceiling = maxContentBytes * DISK_HEADROOM_MULTIPLIER;
    let tripped = false;

    const timer = setInterval(() => {
      // The directory does not exist for the first moments of a clone, and
      // files move under us while git works - either way, skip this tick.
      void directorySize(dir, NOTHING_SKIPPED)
        .then((bytes) => {
          if (bytes <= ceiling || tripped) return;
          tripped = true;
          controller.abort();
        })
        .catch(() => undefined);
    }, SIZE_POLL_INTERVAL_MS);
    timer.unref();

    return {
      get tripped() {
        return tripped;
      },
      stop: () => clearInterval(timer),
    };
  }

  private async assertWithinSizeLimit(repo: ParsedGithubRepo, dir: string): Promise<number> {
    const { maxRepoSizeBytes } = this.config.ingest;
    const sizeBytes = await directorySize(dir, CLONE_METADATA_DIRS);
    if (sizeBytes > maxRepoSizeBytes) {
      throw new RepositoryTooLargeError(
        `${repo.name} is ${Math.round(sizeBytes / BYTES_PER_MB)}MB, over the ` +
          `${Math.round(maxRepoSizeBytes / BYTES_PER_MB)}MB limit.`,
      );
    }
    return sizeBytes;
  }
}
