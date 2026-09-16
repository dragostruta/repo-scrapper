import type { LlmAnswerRequest, LlmProvider } from './llm-provider';

export const STUB_NOT_FOUND_ANSWER = 'I could not find that in this codebase.';

/**
 * Deterministic, network-free provider used when LLM_PROVIDER=stub - which is
 * what CI and the e2e tests run (D11: no live API calls). It still mirrors
 * the real grounding rule (no context -> "not found"), so a test against it
 * is testing something real.
 */
export class StubLlmProvider implements LlmProvider {
  async answer({ question, contextText }: LlmAnswerRequest): Promise<string> {
    if (!contextText.trim()) return STUB_NOT_FOUND_ANSWER;
    return `[stub answer] Based on the provided context, here is a response to: "${question}"`;
  }
}
