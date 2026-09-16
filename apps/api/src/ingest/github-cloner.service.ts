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
    const { cloneTimeoutMs } = this.config.ingest;
    try {
      await this.git.shallowClone(repo.cloneUrl, dir, cloneTimeoutMs);
    } catch (err) {
      this.logger.warn({ repo: repo.name, err: errorMessage(err) }, 'clone failed');
      throw new RepositoryCloneError(
        `Could not clone ${repo.name}. It may not exist, be private, or the clone exceeded ` +
          `the ${cloneTimeoutMs}ms timeout.`,
      );
    }
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
