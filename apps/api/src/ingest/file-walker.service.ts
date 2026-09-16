import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { AppLogger } from '../common/logging/logger.service';
import { detectLanguage, looksBinary } from './language';
import { RepositoryTooLargeError } from './ingest.errors';

export interface WalkedFile {
  /** Path relative to the repository root - this is what gets cited. */
  relativePath: string;
  absolutePath: string;
  language: string;
  content: string;
}

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.turbo',
  '.cache',
  'target',
  '.idea',
  '.vscode',
]);

const IGNORED_FILE_NAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'poetry.lock',
  'Cargo.lock',
  'Gemfile.lock',
  'composer.lock',
]);

/**
 * Walks a cloned repository and returns the text files worth chunking.
 * Binary files, dependency directories, lockfiles and anything over the
 * per-file size cap are skipped rather than erroring - a repo with a few
 * oversized generated files should still index, just without those files.
 */
@Injectable()
export class FileWalkerService {
  private readonly logger;

  constructor(
    private readonly config: AppConfig,
    logger: AppLogger,
  ) {
    this.logger = logger.forContext('FileWalkerService');
  }

  async walk(rootDir: string): Promise<WalkedFile[]> {
    const { maxFiles, maxFileSizeBytes } = this.config.ingest;
    const results: WalkedFile[] = [];
    let skippedBinary = 0;
    let skippedTooLarge = 0;

    const stack = [rootDir];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const entries = await readdir(current, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            stack.push(join(current, entry.name));
          }
          continue;
        }
        if (!entry.isFile()) continue;
        if (IGNORED_FILE_NAMES.has(entry.name)) continue;
        if (looksBinary(entry.name)) {
          skippedBinary++;
          continue;
        }

        const absolutePath = join(current, entry.name);
        const relativePath = relative(rootDir, absolutePath).split('\\').join('/');

        const { size } = await stat(absolutePath);
        if (size > maxFileSizeBytes) {
          skippedTooLarge++;
          continue;
        }
        if (size === 0) continue;

        if (results.length >= maxFiles) {
          throw new RepositoryTooLargeError(
            `Repository has more than ${maxFiles} indexable files. Raise MAX_FILES or narrow ` +
              `what gets indexed.`,
          );
        }

        const buffer = await readFile(absolutePath);
        if (isLikelyBinaryContent(buffer)) {
          skippedBinary++;
          continue;
        }

        results.push({
          relativePath,
          absolutePath,
          language: detectLanguage(entry.name),
          content: buffer.toString('utf-8'),
        });
      }
    }

    this.logger.info(
      { fileCount: results.length, skippedBinary, skippedTooLarge },
      'file walk completed',
    );
    return results;
  }
}

/** Null bytes in the first few KB are the standard heuristic for "not text",
 * catching binaries that slipped past the extension check. */
function isLikelyBinaryContent(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8000);
  return sample.includes(0);
}
