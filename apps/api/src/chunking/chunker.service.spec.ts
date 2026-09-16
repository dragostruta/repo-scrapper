import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFakeLogger } from '../../test/helpers/fake-logger';
import { ChunkerService } from './chunker.service';
import * as treeSitter from './tree-sitter-chunker';
import { chunkWithTreeSitter } from './tree-sitter-chunker';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');

/** Every line of the source is covered by at least one chunk - nothing is silently skipped. */
function assertFullCoverage(chunks: { startLine: number; endLine: number }[], text: string) {
  const totalLines = text.split('\n').length;
  expect(chunks.length).toBeGreaterThan(0);
  const covered = new Array(totalLines + 1).fill(false);
  for (const chunk of chunks) {
    for (let line = chunk.startLine; line <= chunk.endLine; line++) covered[line] = true;
  }
  for (let line = 1; line <= totalLines; line++) expect(covered[line]).toBe(true);
}

describe('ChunkerService', () => {
  let logger: ReturnType<typeof createFakeLogger>;
  let service: ChunkerService;

  beforeEach(() => {
    logger = createFakeLogger();
    service = new ChunkerService(logger);
  });

  afterEach(() => jest.restoreAllMocks());

  it('falls back to line-based chunking for a language with no grammar', async () => {
    const text = fixture('sample.md');
    const chunks = await service.chunkFile(text, 'markdown');
    expect(chunks.every((c) => c.symbol === null)).toBe(true);
    assertFullCoverage(chunks, text);
  });

  it('covers every line of a TypeScript fixture', async () => {
    const text = fixture('sample.ts');
    assertFullCoverage(await service.chunkFile(text, 'typescript'), text);
  });

  it('covers every line of a Python fixture', async () => {
    const text = fixture('sample.py');
    assertFullCoverage(await service.chunkFile(text, 'python'), text);
  });

  it('returns no chunks for whitespace-only content', async () => {
    expect(await service.chunkFile('  \n\n', 'markdown')).toEqual([]);
  });

  it('uses symbol boundaries when the tree-sitter grammar is available', async () => {
    // Exercises the tree-sitter path directly. Requires Jest to run with
    // NODE_OPTIONS=--experimental-vm-modules (see package.json) - without it
    // web-tree-sitter's internal dynamic import is blocked and this fails
    // loudly instead of silently testing the line-based fallback.
    const result = await chunkWithTreeSitter(fixture('sample.ts'), 'typescript');
    expect(result).not.toBeNull();

    // Small trailing symbols can be merged into the previous chunk, so check
    // that every name appears somewhere rather than as its own element.
    const joined = result!
      .map((c) => c.symbol)
      .filter(Boolean)
      .join(' | ');
    for (const name of ['greet', 'Greeter', 'shout']) expect(joined).toContain(name);
  });

  it('falls back and warns only once per language when the grammar is unavailable', async () => {
    jest.spyOn(treeSitter, 'chunkWithTreeSitter').mockResolvedValue(null);

    const first = await service.chunkFile('const a = 1;', 'typescript');
    await service.chunkFile('const b = 2;', 'typescript');
    await service.chunkFile('b = 2', 'python');

    expect(first).toEqual([{ content: 'const a = 1;', startLine: 1, endLine: 1, symbol: null }]);
    expect(logger.logs.warn).toHaveBeenCalledTimes(2);
    expect(logger.logs.warn).toHaveBeenCalledWith({ language: 'typescript' }, expect.any(String));
    expect(logger.logs.warn).toHaveBeenCalledWith({ language: 'python' }, expect.any(String));
  });
});
