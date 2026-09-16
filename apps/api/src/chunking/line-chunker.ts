import { CHUNK_OVERLAP_RATIO, type ChunkCandidate, TARGET_CHUNK_CHARS } from './chunk.types';

/**
 * The fallback that always works: windows of whole lines up to
 * TARGET_CHUNK_CHARS, overlapping so a boundary landing mid-thought still has
 * context on both sides. Used for languages without a grammar, and by the
 * tree-sitter chunker to split one oversized symbol (D5). A single line longer
 * than the target still becomes one chunk - never zero.
 */
export function chunkByLines(text: string, symbol: string | null = null): ChunkCandidate[] {
  if (text.trim().length === 0) return [];

  const lines = text.split('\n');
  const chunks: ChunkCandidate[] = [];
  let start = 0;

  while (start < lines.length) {
    const end = windowEnd(lines, start);
    chunks.push({
      content: lines.slice(start, end).join('\n'),
      startLine: start + 1,
      endLine: end,
      symbol,
    });
    if (end >= lines.length) break;
    start = nextWindowStart(start, end);
  }

  return chunks;
}

/** Exclusive end index of the window starting at `start`: at least one line,
 * then as many more as fit under TARGET_CHUNK_CHARS. */
export function windowEnd(lines: string[], start: number): number {
  let end = start;
  let chars = 0;
  while (end < lines.length && chars < TARGET_CHUNK_CHARS) {
    chars += lines[end].length + 1;
    end++;
  }
  return Math.max(end, start + 1);
}

/** Lines repeated at the start of the next window - always at least one. */
export function overlapLines(windowSize: number): number {
  return Math.max(1, Math.round(windowSize * CHUNK_OVERLAP_RATIO));
}

/**
 * Start of the next window: back up by the overlap, but always move forward
 * at least one line. Without that floor a one-line window (a single line over
 * TARGET_CHUNK_CHARS, e.g. minified JS) overlaps itself entirely and the
 * chunker never terminates.
 */
export function nextWindowStart(start: number, end: number): number {
  return Math.max(start + 1, end - overlapLines(end - start));
}
