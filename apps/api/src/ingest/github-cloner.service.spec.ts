import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFakeLogger } from '../../test/helpers/fake-logger';
import { aParsedRepo } from '../../test/helpers/builders';
import type { AppConfig } from '../config/app-config';
import { RepositoryCloneError, RepositoryTooLargeError } from '../common/errors/domain-errors';
import type { GitClient } from './git.client';
import { GithubClonerService } from './github-cloner.service';

const SHA = 'f'.repeat(40);

/** A GitClient whose "clone" writes a small file tree instead of touching the network. */
function fakeGit(overrides: Partial<Record<keyof GitClient, jest.Mock>> = {}) {
  return {
    shallowClone: jest.fn(async (_url: string, dir: string) => {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src', 'index.ts'), 'x'.repeat(100));
    }),
    remoteHeadSha: jest.fn(async () => SHA),
    headSha: jest.fn(async () => SHA),
    ...overrides,
  };
}

describe('GithubClonerService', () => {
  let workspaceDir: string;

  const build = (git: ReturnType<typeof fakeGit>, maxRepoSizeBytes = 10_000) => {
    const config = {
      ingest: { workspaceDir, cloneTimeoutMs: 5_000, maxRepoSizeBytes },
    } as unknown as AppConfig;
    return new GithubClonerService(config, git as unknown as GitClient, createFakeLogger());
  };

  beforeEach(() => {
    // Deliberately not created: clone() must create the workspace itself.
    workspaceDir = join(tmpdir(), `cloner-spec-${randomUUID()}`, 'nested');
  });

  afterEach(async () => {
    await rm(dirname(workspaceDir), { recursive: true, force: true });
  });

  it('clones into a fresh temp directory and reports the HEAD revision', async () => {
    const git = fakeGit();
    const cloned = await build(git).clone(aParsedRepo());

    expect(cloned.revision).toBe(SHA);
    expect(cloned.dir.startsWith(workspaceDir)).toBe(true);
    expect((await stat(join(cloned.dir, 'src', 'index.ts'))).isFile()).toBe(true);
    expect(git.shallowClone).toHaveBeenCalledWith(
      'https://github.com/acme/widgets.git',
      cloned.dir,
      5_000,
    );
  });

  it('gives every clone its own directory', async () => {
    const service = build(fakeGit());
    const [a, b] = await Promise.all([service.clone(aParsedRepo()), service.clone(aParsedRepo())]);
    expect(a.dir).not.toBe(b.dir);
  });

  it('turns a git failure into a readable RepositoryCloneError and leaves nothing behind', async () => {
    const git = fakeGit({ shallowClone: jest.fn().mockRejectedValue(new Error('exit 128')) });

    const attempt = build(git).clone(aParsedRepo());

    await expect(attempt).rejects.toThrow(RepositoryCloneError);
    await expect(attempt).rejects.toThrow(/Could not clone acme\/widgets/);
    expect(await readdir(workspaceDir)).toEqual([]);
  });

  it('rejects an oversized checkout and deletes it', async () => {
    const attempt = build(fakeGit(), 50).clone(aParsedRepo());

    await expect(attempt).rejects.toThrow(RepositoryTooLargeError);
    expect(await readdir(workspaceDir)).toEqual([]);
  });

  it('accepts a checkout exactly at the size limit', async () => {
    await expect(build(fakeGit(), 100).clone(aParsedRepo())).resolves.toBeDefined();
  });

  it('cleans up when reading the revision fails after a successful clone', async () => {
    const git = fakeGit({ headSha: jest.fn().mockRejectedValue(new Error('corrupt repo')) });

    await expect(build(git).clone(aParsedRepo())).rejects.toThrow('corrupt repo');
    expect(await readdir(workspaceDir)).toEqual([]);
  });

  describe('resolveHeadSha', () => {
    it('returns the remote sha', async () => {
      expect(await build(fakeGit()).resolveHeadSha('https://github.com/a/b.git')).toBe(SHA);
    });

    it('returns null instead of throwing when the remote is unreachable', async () => {
      const git = fakeGit({ remoteHeadSha: jest.fn().mockRejectedValue(new Error('timeout')) });
      expect(await build(git).resolveHeadSha('https://github.com/a/b.git')).toBeNull();
    });
  });

  it('cleanup removes the whole temp parent of a clone', async () => {
    const service = build(fakeGit());
    const cloned = await service.clone(aParsedRepo());

    await service.cleanup(cloned.dir);

    expect(await readdir(workspaceDir)).toEqual([]);
  });
});
