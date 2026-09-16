import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { FileWalkerService } from './file-walker.service';
import { AppConfig } from '../config/app-config';
import { AppLogger } from '../common/logging/logger.service';

async function buildFixtureRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'walker-fixture-'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'node_modules', 'some-dep'), { recursive: true });
  await mkdir(join(root, '.git'), { recursive: true });

  await writeFile(join(root, 'src', 'index.ts'), 'export const x = 1;\n');
  await writeFile(join(root, 'package-lock.json'), '{}');
  await writeFile(join(root, 'node_modules', 'some-dep', 'index.js'), 'module.exports = {};');
  await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/main');
  await writeFile(join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));
  await writeFile(join(root, 'empty.txt'), '');

  return root;
}

describe('FileWalkerService', () => {
  let root: string;
  let service: FileWalkerService;

  beforeEach(async () => {
    root = await buildFixtureRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        FileWalkerService,
        {
          provide: AppConfig,
          useValue: { ingest: { maxFiles: 100, maxFileSizeBytes: 1024 * 1024 } },
        },
        {
          provide: AppLogger,
          useValue: { forContext: () => ({ info: jest.fn(), warn: jest.fn() }) },
        },
      ],
    }).compile();
    service = moduleRef.get(FileWalkerService);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds source files and skips node_modules, .git, lockfiles, binaries and empty files', async () => {
    const files = await service.walk(root);
    const paths = files.map((f) => f.relativePath).sort();
    expect(paths).toEqual(['src/index.ts']);
  });

  it('detects language and preserves relative paths with forward slashes', async () => {
    const [file] = await service.walk(root);
    expect(file.language).toBe('typescript');
    expect(file.relativePath).toBe('src/index.ts');
    expect(file.content).toContain('export const x = 1;');
  });
});
