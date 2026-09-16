/** What the chunker produces. Persistence (Chunk model) is a thin mapping
 * of this plus repositoryId and the embedding vector. */
export interface ChunkCandidate {
  content: string;
  /** 1-based, inclusive. */
  startLine: number;
  endLine: number;
  /** Enclosing function/class/method name, when known. */
  symbol: string | null;
}

export const TARGET_CHUNK_CHARS = 1200;
/** Symbols smaller than this merge with a neighbour rather than becoming
 * their own chunk - keeps single-line helpers and imports out of the index
 * as noise chunks (D5). */
export const MIN_CHUNK_CHARS = 200;
/** Fraction of TARGET_CHUNK_CHARS carried over when an oversized symbol is
 * split into windows, so a boundary a query lands near still has context on
 * both sides. */
export const CHUNK_OVERLAP_RATIO = 0.15;
