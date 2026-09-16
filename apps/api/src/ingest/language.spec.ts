import { detectLanguage, extensionOf, looksBinary, TREE_SITTER_LANGUAGES } from './language';

describe('extensionOf', () => {
  it.each([
    ['src/app.ts', '.ts'],
    ['Component.TSX', '.tsx'],
    ['archive.tar.gz', '.gz'],
    ['Makefile', ''],
    ['.env', '.env'],
  ])('%s -> %j', (path, ext) => {
    expect(extensionOf(path)).toBe(ext);
  });
});

describe('detectLanguage', () => {
  it.each([
    ['a.ts', 'typescript'],
    ['a.mts', 'typescript'],
    ['a.tsx', 'tsx'],
    ['a.jsx', 'javascript'],
    ['a.cjs', 'javascript'],
    ['a.PY', 'python'],
    ['README.md', 'markdown'],
    ['docker-compose.yml', 'yaml'],
    ['main.go', 'go'],
  ])('%s is %s', (path, language) => {
    expect(detectLanguage(path)).toBe(language);
  });

  it('falls back to plaintext for unknown or missing extensions', () => {
    expect(detectLanguage('Makefile')).toBe('plaintext');
    expect(detectLanguage('notes.xyz')).toBe('plaintext');
  });

  it('only routes grammar-backed languages to tree-sitter', () => {
    expect([...TREE_SITTER_LANGUAGES].sort()).toEqual([
      'javascript',
      'python',
      'tsx',
      'typescript',
    ]);
  });
});

describe('looksBinary', () => {
  it.each(['logo.PNG', 'font.woff2', 'bundle.wasm', 'db.sqlite3'])('flags %s', (path) => {
    expect(looksBinary(path)).toBe(true);
  });

  it.each(['app.ts', 'Makefile', 'image.png.ts'])('does not flag %s', (path) => {
    expect(looksBinary(path)).toBe(false);
  });
});
