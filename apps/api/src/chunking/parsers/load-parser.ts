import { join } from 'node:path';
import type { TSParser } from './tree-sitter-node';

/**
 * tree-sitter grammars ship as prebuilt WASM (via the `tree-sitter-wasms`
 * package) so nothing needs a native compiler toolchain on the machine
 * running this - important since we cannot assume every reviewer's machine
 * has one set up correctly.
 *
 * This is the one part of the chunking pipeline whose exact import shape can
 * legitimately vary between web-tree-sitter versions. Every failure mode -
 * missing package, wrong export shape, missing .wasm file for a language -
 * is caught by the caller (TreeSitterChunker) and treated as "no grammar
 * available", which falls back to line-based chunking (D5). Nothing upstream
 * of this file should ever throw past that boundary.
 *
 * Compiles to CommonJS (see tsconfig.json), so the ambient `require` used
 * below is already available - no need for node:module's createRequire.
 */

const WASM_FILE_BY_LANGUAGE: Record<string, string> = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
};

let parserModulePromise: Promise<typeof import('web-tree-sitter')> | null = null;
const languageCache = new Map<string, Promise<TSParser | null>>();

async function getParserModule(): Promise<typeof import('web-tree-sitter')> {
  if (!parserModulePromise) {
    parserModulePromise = (async () => {
      const mod = await import('web-tree-sitter');
      const Parser = ((mod as unknown as { Parser?: unknown }).Parser ??
        (mod as unknown as { default?: unknown }).default) as {
        init: (opts?: Record<string, unknown>) => Promise<void>;
      };
      await Parser.init();
      return mod;
    })();
  }
  return parserModulePromise;
}

/** tree-sitter-wasms publishes its grammars under out/<file>.wasm relative to the package root. */
function resolveWasmPath(fileName: string): string {
  const pkgJsonPath = require.resolve('tree-sitter-wasms/package.json');
  return join(pkgJsonPath, '..', 'out', fileName);
}

/** Returns null - never throws - for any grammar failure; caller falls back
 * to line-based chunking. Not logged here: TreeSitterChunker logs a single
 * warning the first time this happens per language. */
export async function loadParser(language: string): Promise<TSParser | null> {
  const cached = languageCache.get(language);
  if (cached) return cached;

  const promise = (async (): Promise<TSParser | null> => {
    const wasmFile = WASM_FILE_BY_LANGUAGE[language];
    if (!wasmFile) return null;

    try {
      const mod = await getParserModule();
      const ParserCtor = ((mod as unknown as { Parser?: unknown }).Parser ??
        (mod as unknown as { default?: unknown }).default) as new () => TSParser & {
        setLanguage(lang: unknown): void;
      };
      const LanguageCtor = (mod as unknown as { Language?: { load: (path: string) => Promise<unknown> } })
        .Language;

      const wasmPath = resolveWasmPath(wasmFile);
      const grammar = LanguageCtor
        ? await LanguageCtor.load(wasmPath)
        : await (ParserCtor as unknown as { Language: { load: (p: string) => Promise<unknown> } }).Language
            .load(wasmPath);

      const parser = new ParserCtor();
      parser.setLanguage(grammar);
      return parser;
    } catch {
      return null;
    }
  })();

  languageCache.set(language, promise);
  return promise;
}
