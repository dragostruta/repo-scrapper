import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { directorySize } from './directory-size';

describe('directorySize', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dir-size-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('is 0 for an empty directory', async () => {
    expect(await directorySize(root, new Set())).toBe(0);
  });

  it('sums files at every depth', async () => {
    await mkdir(join(root, 'a', 'b', 'c'), { recursive: true });
    await writeFile(join(root, 'top.txt'), '12345');
    await writeFile(join(root, 'a', 'b', 'c', 'deep.txt'), '1234567890');
    expect(await directorySize(root, new Set())).toBe(15);
  });

  it('does not count skipped directories', async () => {
    await mkdir(join(root, '.git'));
    await writeFile(join(root, '.git', 'pack'), 'x'.repeat(1000));
    await writeFile(join(root, 'code.ts'), 'abc');
    expect(await directorySize(root, new Set(['.git']))).toBe(3);
  });

  it('rejects when the directory does not exist', async () => {
    await expect(directorySize(join(root, 'missing'), new Set())).rejects.toThrow();
  });
});
