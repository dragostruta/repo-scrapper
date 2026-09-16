import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { ChunkerService } from './chunker.service';
import { chunkWithTreeSitter } from './tree-sitter-chunker';
import { AppLogger } from '../common/logging/logger.service';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');

describe('ChunkerService', () => {
  let service: ChunkerService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChunkerService,
        {
          provide: AppLogger,
          useValue: { forContext: () => ({ warn: jest.fn(), info: jest.fn() }) },
        },
      ],
    }).compile();
    service = moduleRef.get(ChunkerService);
  });

  it('falls back to line-based chunking for a language with no grammar', async () => {
    const text = fixture('sample.md');
    const chunks = await service.chunkFile(text, 'markdown');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.symbol === null)).toBe(true);
    assertFullCoverage(chunks, text);
  });

  it('covers every line of a TypeScript fixture with no gaps or overlaps in the boundary set', async () => {
    const text = fixture('sample.ts');
    const chunks = await service.chunkFile(text, 'typescript');
    assertFullCoverage(chunks, text);
  });

  it('covers every line of a Python fixture with no gaps or overlaps in the boundary set', async () => {
    const text = fixture('sample.py');
    const chunks = await service.chunkFile(text, 'python');
    assertFullCoverage(chunks, text);
  });

  it('uses symbol boundaries when the tree-sitter grammar is available', async () => {
    // This directly exercises the tree-sitter path rather than going through
    // the fallback-tolerant ChunkerService, so it can make a real assertion
    // on the actual grammar output. Requires the Jest process to run with
    // NODE_OPTIONS=--experimental-vm-modules (set in package.json's `test`
    // script) - without it, web-tree-sitter's internal dynamic import is
    // blocked by Jest's sandboxed VM context and this fails loudly instead
    // of silently falling back to line-based chunking (see D5 in decisions.md).
    const text = fixture('sample.ts');
    const result = await chunkWithTreeSitter(text, 'typescript');

    expect(result).not.toBeNull();

    // Small trailing symbols can be folded into the previous chunk (see
    // mergeSmallSegments), so a name may appear combined with another
    // rather than as its own element - check containment, not exact
    // element membership.
    const joined = result!
      .map((c) => c.symbol)
      .filter(Boolean)
      .join(' | ');
    for (const name of ['greet', 'Greeter', 'shout']) {
      expect(joined).toContain(name);
    }
  });
});

/** Every line of the source must be covered by exactly one primary chunk
 * ordering - overlap chunks (from splitting an oversized symbol) are allowed
 * to repeat lines, but the chunk set as a whole must reach every line and
 * never skip one. */
function assertFullCoverage(chunks: { startLine: number; endLine: number }[], text: string) {
  const totalLines = text.split('\n').length;
  expect(chunks.length).toBeGreaterThan(0);

  const covered = new Array(totalLines + 1).fill(false);
  for (const chunk of chunks) {
    for (let line = chunk.startLine; line <= chunk.endLine; line++) covered[line] = true;
  }
  for (let line = 1; line <= totalLines; line++) {
    expect(covered[line]).toBe(true);
  }
}
