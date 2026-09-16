import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';

const execFileAsync = promisify(execFile);

/** Fail fast instead of hanging on a credential prompt for a private or
 * nonexistent repository. */
const NON_INTERACTIVE_ENV = { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' };

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

/** Extracts HEAD's sha from `git ls-remote <url> HEAD` output, or null if the
 * output isn't a single well-formed sha. */
export function parseRemoteHeadSha(stdout: string): string | null {
  const sha = stdout.trim().split(/\s+/)[0] ?? '';
  return SHA_PATTERN.test(sha) ? sha : null;
}

/**
 * The only place this codebase shells out to git. Keeping every git
 * invocation behind this class means the clone logic can be tested with a
 * fake instead of real processes and network access.
 */
@Injectable()
export class GitClient {
  async shallowClone(url: string, targetDir: string, timeoutMs: number): Promise<void> {
    await execFileAsync(
      'git',
      ['clone', '--depth', '1', '--single-branch', '--no-tags', '--', url, targetDir],
      { timeout: timeoutMs, env: { ...process.env, ...NON_INTERACTIVE_ENV } },
    );
  }

  /** Asks the remote for HEAD without fetching any objects. */
  async remoteHeadSha(url: string, timeoutMs: number): Promise<string | null> {
    const { stdout } = await execFileAsync('git', ['ls-remote', url, 'HEAD'], {
      timeout: timeoutMs,
      env: { ...process.env, ...NON_INTERACTIVE_ENV },
    });
    return parseRemoteHeadSha(stdout);
  }

  /** Full sha of HEAD in a local checkout. */
  async headSha(dir: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: dir });
    return stdout.trim();
  }
}
