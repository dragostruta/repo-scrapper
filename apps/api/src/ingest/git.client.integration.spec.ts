import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { GitClient } from './git.client';

const run = promisify(execFile);

/**
 * Runs the real `git` binary against a repository created on local disk, so
 * the exact commands GitClient issues are exercised without any network.
 */
describe('GitClient (real git, local repository)', () => {
  const git = new GitClient();
  let workDir: string;
  let origin: string;
  let originUrl: string;
  let commitSha: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'git-client-'));
    origin = join(workDir, 'origin');
    originUrl = `file://${origin}`;
    await run('git', ['init', '--quiet', origin]);
    await writeFile(join(origin, 'README.md'), '# hello\n');
    const identity = ['-c', 'user.name=test', '-c', 'user.email=test@example.com'];
    await run('git', [...identity, 'add', '.'], { cwd: origin });
    await run('git', [...identity, 'commit', '--quiet', '-m', 'init'], { cwd: origin });
    commitSha = (await run('git', ['rev-parse', 'HEAD'], { cwd: origin })).stdout.trim();
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('remoteHeadSha reads HEAD from the remote without cloning', async () => {
    expect(await git.remoteHeadSha(originUrl, 10_000)).toBe(commitSha);
  });

  it('shallowClone checks out the working tree and headSha reports its commit', async () => {
    const target = join(workDir, 'clone');
    await git.shallowClone(originUrl, target, 10_000);

    expect(await readFile(join(target, 'README.md'), 'utf-8')).toBe('# hello\n');
    expect(await git.headSha(target)).toBe(commitSha);
  });

  it('shallowClone rejects for a repository that does not exist', async () => {
    await expect(
      git.shallowClone(`file://${join(workDir, 'missing')}`, join(workDir, 'x'), 10_000),
    ).rejects.toThrow();
  });

  it('remoteHeadSha rejects for a repository that does not exist', async () => {
    await expect(git.remoteHeadSha(`file://${join(workDir, 'missing')}`, 10_000)).rejects.toThrow();
  });
});
