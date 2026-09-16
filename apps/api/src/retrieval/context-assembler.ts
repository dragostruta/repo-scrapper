import type { RetrievedChunk } from './chunk-repository.service';

export interface AssembledContext {
  /** Chunks that fit the budget, still in score order (highest first). */
  chunks: RetrievedChunk[];
  /** The text actually sent to the LLM - each chunk prefixed with its file
   * location so the model can cite it accurately. */
  text: string;
  estimatedTokens: number;
}

/** ~4 characters per token is the standard rough estimate for English/code
 * text and avoids pulling in a real tokenizer just to enforce a budget. */
const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function formatChunk(chunk: RetrievedChunk): string {
  const location = `${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`;
  const symbol = chunk.symbol ? ` (${chunk.symbol})` : '';
  return `--- ${location}${symbol} ---\n${chunk.content}`;
}

/**
 * Chunks arrive already ranked highest-score-first (ChunkRepository.search
 * orders by score DESC). This keeps adding chunks until the next one would
 * blow the token budget, then stops - lowest-scoring chunks are the ones
 * dropped, per the README's "Prompt & context management" section.
 */
export function assembleContext(chunks: RetrievedChunk[], tokenBudget: number): AssembledContext {
  const kept: RetrievedChunk[] = [];
  const blocks: string[] = [];
  let tokens = 0;

  for (const chunk of chunks) {
    const block = formatChunk(chunk);
    const blockTokens = estimateTokens(block);
    if (kept.length > 0 && tokens + blockTokens > tokenBudget) break;

    kept.push(chunk);
    blocks.push(block);
    tokens += blockTokens;
  }

  return { chunks: kept, text: blocks.join('\n\n'), estimatedTokens: tokens };
}
