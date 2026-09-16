import { CHUNK_OVERLAP_RATIO, type ChunkCandidate, TARGET_CHUNK_CHARS } from './chunk.types';

/**
 * The fallback that always works: fixed-size windows over raw lines, with
 * overlap so a boundary landing mid-thought still has surrounding context.
 * Used directly for languages with no tree-sitter grammar, and internally by
 * the tree-sitter chunker to split any single symbol too large to be one
 * chunk (D5).
 */
export function chunkByLines(text: string, symbol: string | null = null): ChunkCandidate[] {
  const lines = text.split('\n');
  if (lines.length === 0 || text.trim().length === 0) return [];

  const chunks: ChunkCandidate[] = [];
  let start = 0;

  while (start < lines.length) {
    let end = start;
    let chars = 0;
    while (end < lines.length && chars < TARGET_CHUNK_CHARS) {
      chars += lines[end].length + 1;
      end++;
    }
    // Always include at least one line, even if it alone exceeds the target -
    // a 2000-character minified line should still become exactly one chunk,
    // not zero.
    if (end === start) end = start + 1;

    chunks.push({
      content: lines.slice(start, end).join('\n'),
      startLine: start + 1,
      endLine: end,
      symbol,
    });

    if (end >= lines.length) break;
    const overlapLines = Math.max(1, Math.round((end - start) * CHUNK_OVERLAP_RATIO));
    start = end - overlapLines;
  }

  return chunks;
}
