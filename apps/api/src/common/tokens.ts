/**
 * Rough token estimate, used only to enforce the context budget.
 *
 * The familiar "~4 characters per token" figure is measured on English prose.
 * Code tokenizes worse: identifiers split on camelCase and snake_case,
 * punctuation and indentation each cost a token, and long import paths
 * fragment. Measured against real source files it lands nearer 3.
 *
 * 3 is therefore the deliberate choice, because the two directions are not
 * symmetric. Overestimating tokens wastes a little budget; underestimating
 * them overflows the model's context window and the request fails. A cheap
 * heuristic should err toward the recoverable side.
 *
 * A real tokenizer would be exact, but it means shipping (and version-pinning)
 * a tokenizer per provider just to decide how many chunks fit - see
 * "What I skipped" in the README.
 */
const CHARS_PER_TOKEN = 3;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
