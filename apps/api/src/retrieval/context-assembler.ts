import { estimateTokens } from '../common/tokens';
import type { RetrievedChunk } from '../persistence/chunk.store';

export interface AssembledContext {
  /** Chunks that fit the budget, still in score order (highest first). */
  chunks: RetrievedChunk[];
  /** The text sent to the LLM - each chunk headed by its location so the model can cite it. */
  text: string;
  estimatedTokens: number;
}

export function formatChunk(chunk: RetrievedChunk): string {
  const location = `${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`;
  const symbol = chunk.symbol ? ` (${chunk.symbol})` : '';
  return `--- ${location}${symbol} ---\n${chunk.content}`;
}

/**
 * Chunks arrive ranked highest score first. Walk them in that order and keep
 * each one that still fits, so the lowest-scoring chunks are the ones dropped.
 *
 * A chunk that does not fit is skipped rather than ending the walk: one
 * unusually large chunk in the middle of the ranking should not cost us the
 * smaller, still-relevant ones below it. Rank order among what is kept is
 * preserved either way.
 *
 * The top chunk is always kept, even if it alone is over budget - an answer
 * with some context beats one with none.
 */
export function assembleContext(chunks: RetrievedChunk[], tokenBudget: number): AssembledContext {
  const kept: RetrievedChunk[] = [];
  const blocks: string[] = [];
  let tokens = 0;

  for (const chunk of chunks) {
    const block = formatChunk(chunk);
    const blockTokens = estimateTokens(block);
    if (kept.length > 0 && tokens + blockTokens > tokenBudget) continue;

    kept.push(chunk);
    blocks.push(block);
    tokens += blockTokens;
  }

  return { chunks: kept, text: blocks.join('\n\n'), estimatedTokens: tokens };
}
