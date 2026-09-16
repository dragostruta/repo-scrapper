/**
 * Extension -> language id. Used both to route files to the right
 * tree-sitter grammar (chunking/) and to filter out content that is never
 * worth chunking (images, binaries, lockfiles).
 */
const EXTENSION_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.html': 'html',
  '.css': 'css',
  '.sql': 'sql',
  '.sh': 'shell',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
};

/** Languages with a tree-sitter grammar wired up in chunking/. Everything
 * else - including languages we can name above - gets line-based chunking. */
export const TREE_SITTER_LANGUAGES = new Set(['typescript', 'tsx', 'javascript', 'python']);

/** Lower-cased extension including the dot (".ts"), or '' if there is none. */
export function extensionOf(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  return dot === -1 ? '' : filePath.slice(dot).toLowerCase();
}

export function detectLanguage(filePath: string): string {
  return EXTENSION_LANGUAGE[extensionOf(filePath)] ?? 'plaintext';
}

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.svg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.webm',
  '.zip',
  '.tar',
  '.gz',
  '.tgz',
  '.rar',
  '.7z',
  '.pdf',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.wasm',
  '.db',
  '.sqlite',
  '.sqlite3',
]);

export function looksBinary(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(extensionOf(filePath));
}
