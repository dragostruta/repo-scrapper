import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TARGET_CHUNK_CHARS } from './chunk.types';
import { chunkWithTreeSitter, combineSymbols } from './tree-sitter-chunker';

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf-8');

describe('combineSymbols', () => {
  it.each([
    ['a', 'b', 'a, b'],
    ['a', 'a', 'a'],
    ['a', null, 'a'],
    [null, 'b', 'b'],
    [null, null, null],
  ])('(%j, %j) -> %j', (first, second, expected) => {
    expect(combineSymbols(first, second)).toBe(expected);
  });
});

describe('chunkWithTreeSitter', () => {
  it('names Python functions and classes', async () => {
    const chunks = await chunkWithTreeSitter(fixture('sample.py'), 'python');
    expect(chunks).not.toBeNull();
    const names = chunks!
      .map((c) => c.symbol)
      .filter(Boolean)
      .join(' | ');
    expect(names.length).toBeGreaterThan(0);
  });

  it('returns null for a language with no grammar', async () => {
    expect(await chunkWithTreeSitter('fn main() {}', 'rust')).toBeNull();
  });

  it('returns no chunks (not null) for an empty file - nothing to fall back for', async () => {
    expect(await chunkWithTreeSitter('', 'typescript')).toEqual([]);
    expect(await chunkWithTreeSitter('\n\n', 'typescript')).toEqual([]);
  });

  it('splits an oversized function into windows that all keep its name', async () => {
    const body = Array.from({ length: 200 }, (_, i) => `  const value${i} = ${i} * 2;`).join('\n');
    const source = `export function giant() {\n${body}\n}\n`;

    const chunks = await chunkWithTreeSitter(source, 'typescript');

    expect(chunks!.length).toBeGreaterThan(1);
    expect(chunks!.every((c) => c.symbol === 'giant')).toBe(true);
    expect(chunks!.every((c) => c.content.length <= TARGET_CHUNK_CHARS + 100)).toBe(true);
  });

  it('keeps top-level code between symbols instead of dropping it', async () => {
    const source = [
      "import { a } from './a';",
      `export function first() {\n${'  return 1;\n'.repeat(40)}}`,
      'console.log("side effect");',
      `export function second() {\n${'  return 2;\n'.repeat(40)}}`,
    ].join('\n');

    const chunks = await chunkWithTreeSitter(source, 'typescript');
    const joined = chunks!.map((c) => c.content).join('\n');
    expect(joined).toContain('side effect');
    expect(joined).toContain("import { a } from './a';");
  });
});
