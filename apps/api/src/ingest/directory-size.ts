import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Total size in bytes of every regular file under `dir`, skipping any
 * directory whose name is in `skipDirs` (e.g. `.git`, which is clone
 * metadata rather than repository content). Iterative, so a deeply nested
 * tree can't overflow the call stack.
 */
export async function directorySize(dir: string, skipDirs: ReadonlySet<string>): Promise<number> {
  let total = 0;
  const pending = [dir];

  while (pending.length > 0) {
    const current = pending.pop()!;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) pending.push(fullPath);
      } else if (entry.isFile()) {
        total += (await stat(fullPath)).size;
      }
    }
  }
  return total;
}
