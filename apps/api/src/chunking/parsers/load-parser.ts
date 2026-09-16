import { join } from 'node:path';
import type { TSParser } from './tree-sitter-node';

/**
 * Grammars ship as prebuilt WASM (`tree-sitter-wasms`), so no native compiler
 * toolchain is needed wherever this runs (D5).
 *
 * The import shape of web-tree-sitter has changed between major versions,
 * so every failure - missing package, unexpected export shape, missing .wasm -
 * resolves to `null` ("no grammar"), and the caller falls back to line-based
 * chunking. Nothing here ever throws.
 */

const WASM_FILE_BY_LANGUAGE: Readonly<Record<string, string>> = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
};

type WebTreeSitter = typeof import('web-tree-sitter');

interface ParserClasses {
  Parser: { init(): Promise<void>; new (): TSParser & { setLanguage(grammar: unknown): void } };
  Language: { load(wasmPath: string): Promise<unknown> };
}

let classesPromise: Promise<ParserClasses> | null = null;
const parserCache = new Map<string, Promise<TSParser | null>>();

/** One parser per language, created on first use and reused after that. */
export function loadParser(language: string): Promise<TSParser | null> {
  let parser = parserCache.get(language);
  if (!parser) {
    parser = createParser(language);
    parserCache.set(language, parser);
  }
  return parser;
}

export function wasmFileFor(language: string): string | null {
  return WASM_FILE_BY_LANGUAGE[language] ?? null;
}

async function createParser(language: string): Promise<TSParser | null> {
  const wasmFile = wasmFileFor(language);
  if (!wasmFile) return null;

  try {
    const { Parser, Language } = await getParserClasses();
    const grammar = await Language.load(resolveWasmPath(wasmFile));
    const parser = new Parser();
    parser.setLanguage(grammar);
    return parser;
  } catch {
    return null;
  }
}

/** Imports and initialises web-tree-sitter once for the whole process. */
function getParserClasses(): Promise<ParserClasses> {
  if (!classesPromise) {
    classesPromise = import('web-tree-sitter').then(async (mod) => {
      const classes = resolveParserClasses(mod);
      await classes.Parser.init();
      return classes;
    });
  }
  return classesPromise;
}

/** Newer versions export `{ Parser, Language }`; older ones a default Parser with a static Language. */
function resolveParserClasses(mod: WebTreeSitter): ParserClasses {
  const loose = mod as unknown as {
    Parser?: ParserClasses['Parser'] & { Language?: ParserClasses['Language'] };
    default?: ParserClasses['Parser'] & { Language?: ParserClasses['Language'] };
    Language?: ParserClasses['Language'];
  };
  const Parser = loose.Parser ?? loose.default;
  const Language = loose.Language ?? Parser?.Language;
  if (!Parser || !Language) throw new Error('Unrecognised web-tree-sitter export shape');
  return { Parser, Language };
}

/** tree-sitter-wasms publishes its grammars under out/<file>.wasm. */
function resolveWasmPath(fileName: string): string {
  return join(require.resolve('tree-sitter-wasms/package.json'), '..', 'out', fileName);
}
