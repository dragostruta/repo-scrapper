export interface LlmAnswerRequest {
  question: string;
  /** Already-assembled, budget-trimmed context blocks (see retrieval/context-assembler.ts). */
  contextText: string;
}

/**
 * Every provider - Anthropic, Ollama, or the test stub - implements exactly
 * this. Nothing above this interface knows which one is active; that is what
 * makes swapping providers a config change (D-cost-posture) rather than a
 * code change.
 */
export interface LlmProvider {
  answer(request: LlmAnswerRequest): Promise<string>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
