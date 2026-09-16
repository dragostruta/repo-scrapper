import type { ChunkExcerpt, Citation, SearchHit } from '@app/shared';
import type { RetrievedChunk, StoredChunk } from '../persistence/chunk.store';

const SCORE_DECIMALS = 1000;

/** What an answer cites: where the chunk is, never its content (fetched on demand). */
export function toCitation(chunk: RetrievedChunk): Citation {
  return {
    chunkId: chunk.id,
    path: chunk.filePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    symbol: chunk.symbol,
    language: chunk.language,
    score: Math.round(chunk.score * SCORE_DECIMALS) / SCORE_DECIMALS,
  };
}

export function toChunkExcerpt(chunk: StoredChunk): ChunkExcerpt {
  return {
    path: chunk.filePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    symbol: chunk.symbol,
    language: chunk.language,
    content: chunk.content,
  };
}

/** A citation plus its code - search results are read directly, not expanded on demand. */
export function toSearchHit(chunk: RetrievedChunk): SearchHit {
  return { ...toCitation(chunk), content: chunk.content };
}
