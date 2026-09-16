/** ~4 characters per token is the usual rough estimate for English and code,
 * and avoids shipping a real tokenizer just to enforce a budget. */
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
