import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { AppLogger } from '../common/logging/logger.service';
import { RepositoryTooLargeError } from '../common/errors/domain-errors';
import { detectLanguage, looksBinary } from './language';

export interface WalkedFile {
  /** Path relative to the repository root, with forward slashes - this is what gets cited. */
  relativePath: string;
  absolutePath: string;
  language: string;
  content: string;
}

export type SkipReason = 'lockfile' | 'binary' | 'too_large' | 'empty';

type FileInspection =
  { kind: 'indexable'; file: WalkedFile } | { kind: 'skipped'; reason: SkipReason };

const IGNORED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  '__pycache__',
  'venv',
  'target',
]);

const LOCKFILES: ReadonlySet<string> = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'poetry.lock',
  'Cargo.lock',
  'Gemfile.lock',
  'composer.lock',
]);

/** Null bytes early in a file are the standard "not text" heuristic, catching
 * binaries that slipped past the extension check. */
const BINARY_SNIFF_BYTES = 8000;

export function isLikelyBinaryContent(buffer: Buffer): boolean {
  return buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0);
}

/** Dependency, build output and hidden directories (.git, .next, .venv, ...)
 * never contain code worth indexing. */
export function isIgnoredDirectory(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRS.has(name);
}

/**
 * Walks a cloned repository and returns the text files worth chunking.
 * Binary files, lockfiles, dependency directories and oversized files are
 * skipped rather than failing the whole ingest; only exceeding MAX_FILES
 * indexable files is an error.
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
    const files: WalkedFile[] = [];
    const skipped: Record<SkipReason, number> = { lockfile: 0, binary: 0, too_large: 0, empty: 0 };

    for await (const absolutePath of this.listFiles(rootDir)) {
      const inspection = await this.inspect(rootDir, absolutePath);
      if (inspection.kind === 'skipped') {
        skipped[inspection.reason]++;
        continue;
      }
      this.assertUnderFileLimit(files.length);
      files.push(inspection.file);
    }

    this.logger.info({ fileCount: files.length, skipped }, 'file walk completed');
    return files;
  }

  /** Every regular file under rootDir, not descending into ignored directories. */
  private async *listFiles(rootDir: string): AsyncGenerator<string> {
    const pending = [rootDir];
    while (pending.length > 0) {
      const current = pending.pop()!;
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const fullPath = join(current, entry.name);
        if (entry.isDirectory() && !isIgnoredDirectory(entry.name)) pending.push(fullPath);
        else if (entry.isFile()) yield fullPath;
      }
    }
  }

  /** Decides whether one file is indexed, cheapest checks first. */
  private async inspect(rootDir: string, absolutePath: string): Promise<FileInspection> {
    const name = absolutePath.slice(absolutePath.lastIndexOf(sep) + 1);
    if (LOCKFILES.has(name)) return { kind: 'skipped', reason: 'lockfile' };
    if (looksBinary(name)) return { kind: 'skipped', reason: 'binary' };

    const { size } = await stat(absolutePath);
    if (size === 0) return { kind: 'skipped', reason: 'empty' };
    if (size > this.config.ingest.maxFileSizeBytes) return { kind: 'skipped', reason: 'too_large' };

    const buffer = await readFile(absolutePath);
    if (isLikelyBinaryContent(buffer)) return { kind: 'skipped', reason: 'binary' };

    return {
      kind: 'indexable',
      file: {
        relativePath: relative(rootDir, absolutePath).split(sep).join('/'),
        absolutePath,
        language: detectLanguage(name),
        content: buffer.toString('utf-8'),
      },
    };
  }

  private assertUnderFileLimit(currentCount: number): void {
    const { maxFiles } = this.config.ingest;
    if (currentCount >= maxFiles) {
      throw new RepositoryTooLargeError(
        `Repository has more than ${maxFiles} indexable files. Raise MAX_FILES or narrow ` +
          `what gets indexed.`,
      );
    }
  }
}
