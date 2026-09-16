import {
  CHUNK_OVERLAP_RATIO,
  type ChunkCandidate,
  MIN_CHUNK_CHARS,
  TARGET_CHUNK_CHARS,
} from './chunk.types';
import { chunkByLines } from './line-chunker';
import { matchSymbol } from './languages/symbol-rules';
import { loadParser } from './parsers/load-parser';
import type { TSNode } from './parsers/tree-sitter-node';

interface RawSegment {
  startLine: number; // 1-based, inclusive
  endLine: number; // 1-based, inclusive
  symbol: string | null;
}

/**
 * Parses source with tree-sitter and returns chunk-sized segments cut on
 * function/class/method boundaries, or null if the grammar for this language
 * could not be loaded - the caller falls back to line-based chunking in that
 * case (D5). This function never throws.
 */
export async function chunkWithTreeSitter(
  text: string,
  treeSitterLanguage: string,
): Promise<ChunkCandidate[] | null> {
  const parser = await loadParser(treeSitterLanguage);
  if (!parser) return null;

  let root: TSNode;
  try {
    const tree = parser.parse(text);
    if (!tree) return null;
    root = tree.rootNode;
  } catch {
    return null;
  }

  const lines = text.split('\n');
  const segments = collectTopLevelSegments(root, treeSitterLanguage, lines.length);
  if (segments.length === 0) return null;

  const merged = mergeSmallSegments(segments, lines);
  return merged.flatMap((segment) => materialiseSegment(segment, lines));
}

/** Top-level children of the file, each turned into a candidate boundary.
 * Gaps between recognised symbols (imports, top-level statements) become
 * unnamed segments rather than being dropped, so every line of the file ends
 * up in exactly one chunk. */
function collectTopLevelSegments(root: TSNode, language: string, totalLines: number): RawSegment[] {
  const segments: RawSegment[] = [];
  let cursor = 1; // next unclaimed 1-based line

  for (const node of root.namedChildren) {
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    if (startLine > cursor) {
      segments.push({ startLine: cursor, endLine: startLine - 1, symbol: null });
    }

    const match = matchSymbol(node, language);
    segments.push({ startLine, endLine, symbol: match?.name ?? null });
    cursor = endLine + 1;
  }

  if (cursor <= totalLines) {
    segments.push({ startLine: cursor, endLine: totalLines, symbol: null });
  }

  return segments.filter((s) => s.endLine >= s.startLine);
}

function segmentChars(segment: RawSegment, lines: string[]): number {
  let chars = 0;
  for (let i = segment.startLine - 1; i < segment.endLine; i++) chars += lines[i].length + 1;
  return chars;
}

/** Folds any segment under MIN_CHUNK_CHARS into the segment before it
 * (extending that kept segment's range), so a symbol name introduced by e.g. a
 * decorator or comment block stays attached to the code it describes. A small
 * *leading* segment - nothing has been kept yet - has no predecessor to merge
 * into and survives as its own small chunk; in practice that is just a short
 * top-of-file import block, so it is left as-is rather than special-cased. */
function mergeSmallSegments(segments: RawSegment[], lines: string[]): RawSegment[] {
  const out: RawSegment[] = [];

  for (const segment of segments) {
    const prev = out.at(-1);
    if (prev && shouldMerge(prev, segment, lines)) {
      out[out.length - 1] = {
        startLine: prev.startLine,
        endLine: segment.endLine,
        symbol: combineSymbols(prev.symbol, segment.symbol),
      };
    } else {
      out.push({ ...segment });
    }
  }

  return out;
}

/** A small segment joins its predecessor unless that predecessor is already full-sized. */
function shouldMerge(prev: RawSegment, segment: RawSegment, lines: string[]): boolean {
  return (
    segmentChars(segment, lines) < MIN_CHUNK_CHARS && segmentChars(prev, lines) < TARGET_CHUNK_CHARS
  );
}

/**
 * Label for a merged segment. Merging can fold a second named symbol (e.g. a
 * small trailing `const foo = () => {}`) into the previous chunk; keeping
 * only one name would make the citation disagree with part of its content,
 * so both names are kept.
 */
export function combineSymbols(first: string | null, second: string | null): string | null {
  if (first && second && first !== second) return `${first}, ${second}`;
  return first ?? second;
}

/** A segment that fits becomes one chunk; an oversized one (e.g. a 500-line
 * function) is split into overlapping windows that all keep the parent
 * symbol's name (D5). */
function materialiseSegment(segment: RawSegment, lines: string[]): ChunkCandidate[] {
  const content = lines.slice(segment.startLine - 1, segment.endLine).join('\n');
  if (content.trim().length === 0) return [];

  if (content.length <= TARGET_CHUNK_CHARS) {
    return [
      { content, startLine: segment.startLine, endLine: segment.endLine, symbol: segment.symbol },
    ];
  }

  return chunkByLines(content, segment.symbol).map((chunk) => ({
    ...chunk,
    startLine: chunk.startLine + segment.startLine - 1,
    endLine: chunk.endLine + segment.startLine - 1,
  }));
}

// Re-exported so callers/tests don't need to duplicate this constant.
export const OVERSIZED_SPLIT_OVERLAP_RATIO = CHUNK_OVERLAP_RATIO;
