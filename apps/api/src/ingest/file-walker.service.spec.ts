import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeLogger } from '../../test/helpers/fake-logger';
import type { AppConfig } from '../config/app-config';
import { RepositoryTooLargeError } from '../common/errors/domain-errors';
import {
  FileWalkerService,
  isIgnoredDirectory,
  isLikelyBinaryContent,
} from './file-walker.service';

async function write(root: string, relativePath: string, content: string | Buffer): Promise<void> {
  const full = join(root, relativePath);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content);
}

describe('FileWalkerService', () => {
  let root: string;
  const logger = createFakeLogger();

  const walker = (maxFiles = 100, maxFileSizeBytes = 1024) =>
    new FileWalkerService(
      { ingest: { maxFiles, maxFileSizeBytes } } as unknown as AppConfig,
      logger,
    );

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'walker-spec-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns source files with language, forward-slash paths and content', async () => {
    await write(root, 'src/deep/nested/auth.ts', 'export const login = 1;\n');
    await write(root, 'app.py', 'def main(): pass\n');

    const files = await walker().walk(root);

    expect(files.map((f) => f.relativePath).sort()).toEqual(['app.py', 'src/deep/nested/auth.ts']);
    const ts = files.find((f) => f.relativePath.endsWith('auth.ts'))!;
    expect(ts).toMatchObject({ language: 'typescript', content: 'export const login = 1;\n' });
    expect(ts.absolutePath).toBe(join(root, 'src', 'deep', 'nested', 'auth.ts'));
  });

  it('skips dependency, build and hidden directories', async () => {
    await write(root, 'src/index.ts', 'ok');
    for (const dir of [
      'node_modules/dep',
      'dist',
      '.git',
      '.next',
      '.venv',
      'coverage',
      '__pycache__',
    ]) {
      await write(root, `${dir}/file.js`, 'ignored');
    }
    const files = await walker().walk(root);
    expect(files.map((f) => f.relativePath)).toEqual(['src/index.ts']);
  });

  it('skips lockfiles, binaries, empty and oversized files, and logs why', async () => {
    await write(root, 'src/index.ts', 'ok');
    await write(root, 'package-lock.json', '{}');
    await write(root, 'logo.png', Buffer.from([0x89, 0x50]));
    await write(root, 'data.bin.txt', Buffer.from([0x61, 0x00, 0x62]));
    await write(root, 'empty.ts', '');
    await write(root, 'huge.ts', 'x'.repeat(2048));

    const files = await walker().walk(root);

    expect(files.map((f) => f.relativePath)).toEqual(['src/index.ts']);
    expect(logger.logs.info).toHaveBeenLastCalledWith(
      { fileCount: 1, skipped: { lockfile: 1, binary: 2, too_large: 1, empty: 1 } },
      'file walk completed',
    );
  });

  it('accepts a file exactly at the size limit', async () => {
    await write(root, 'limit.ts', 'x'.repeat(1024));
    expect(await walker().walk(root)).toHaveLength(1);
  });

  it('returns an empty list for an empty repository', async () => {
    expect(await walker().walk(root)).toEqual([]);
  });

  it('allows exactly MAX_FILES indexable files', async () => {
    await write(root, 'a.ts', 'a');
    await write(root, 'b.ts', 'b');
    expect(await walker(2).walk(root)).toHaveLength(2);
  });

  it('fails once there are more than MAX_FILES indexable files', async () => {
    await write(root, 'a.ts', 'a');
    await write(root, 'b.ts', 'b');
    await write(root, 'c.ts', 'c');
    await expect(walker(2).walk(root)).rejects.toThrow(RepositoryTooLargeError);
  });

  it('does not count skipped files towards MAX_FILES', async () => {
    await write(root, 'a.ts', 'a');
    await write(root, 'yarn.lock', 'lock');
    await write(root, 'img.png', 'png');
    expect(await walker(1).walk(root)).toHaveLength(1);
  });
});

describe('isIgnoredDirectory', () => {
  it.each(['node_modules', 'dist', '.git', '.anything', 'venv', 'target'])('ignores %s', (name) => {
    expect(isIgnoredDirectory(name)).toBe(true);
  });

  it.each(['src', 'lib', 'distribution', 'app'])('walks %s', (name) => {
    expect(isIgnoredDirectory(name)).toBe(false);
  });
});

describe('isLikelyBinaryContent', () => {
  it('detects a null byte in the sniffed prefix', () => {
    expect(isLikelyBinaryContent(Buffer.from([0x68, 0x00, 0x69]))).toBe(true);
  });

  it('treats plain text as text', () => {
    expect(isLikelyBinaryContent(Buffer.from('hello world'))).toBe(false);
  });

  it('only sniffs the first 8000 bytes', () => {
    const late = Buffer.concat([Buffer.alloc(8000, 0x61), Buffer.from([0x00])]);
    expect(isLikelyBinaryContent(late)).toBe(false);
  });
});
