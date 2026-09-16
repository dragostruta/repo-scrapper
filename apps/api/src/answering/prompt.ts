/**
 * The grounding rules (D-guardrails / README "Prompt & context management").
 * Kept in one place so both real providers and the stub build the exact same
 * prompt shape - a provider swap should never change what the model is told.
 */
export function buildSystemPrompt(): string {
  return [
    'You are a code documentation assistant. You answer questions about a specific',
    'codebase using ONLY the context excerpts provided below - you have no other',
    'knowledge of this repository.',
    '',
    'Rules:',
    '- Base every claim on the provided context. Do not invent functions, files,',
    '  endpoints, or behaviour that is not shown.',
    '- When you describe what code does, reference the file path it came from.',
    '- If the context does not contain enough information to answer, say so',
    '  plainly ("I could not find that in this codebase") instead of guessing.',
    '- Be concise and specific. Prefer naming the exact file/function over a',
    '  general description.',
  ].join('\n');
}

export function buildUserMessage(question: string, contextText: string): string {
  if (!contextText.trim()) {
    return `Question: ${question}\n\n(No relevant context was found in the indexed codebase for this question.)`;
  }
  return `Context from the codebase:\n\n${contextText}\n\n---\n\nQuestion: ${question}`;
}
