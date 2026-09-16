import { loadParser, wasmFileFor } from './load-parser';

describe('load-parser', () => {
  it('maps supported languages to their grammar files', () => {
    expect(wasmFileFor('typescript')).toBe('tree-sitter-typescript.wasm');
    expect(wasmFileFor('python')).toBe('tree-sitter-python.wasm');
    expect(wasmFileFor('rust')).toBeNull();
  });

  it('returns null for a language without a grammar', async () => {
    expect(await loadParser('cobol')).toBeNull();
  });

  it('loads a working parser and reuses it', async () => {
    const first = await loadParser('typescript');
    expect(first).not.toBeNull();
    expect(first!.parse('const x = 1;')?.rootNode.type).toBe('program');
    expect(await loadParser('typescript')).toBe(first);
  });
});
