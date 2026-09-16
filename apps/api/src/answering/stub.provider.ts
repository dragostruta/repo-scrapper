import { Injectable } from '@nestjs/common';
import type { LlmAnswerRequest, LlmProvider } from './llm-provider';

/**
 * Deterministic, network-free provider used when LLM_PROVIDER=stub - which is
 * what CI and the e2e test set (D11: no live API calls in tests). It still
 * exercises the real grounding behaviour (empty context -> "not found") so a
 * test against it is testing something real, not a no-op.
 */
@Injectable()
export class StubLlmProvider implements LlmProvider {
  async answer({ question, contextText }: LlmAnswerRequest): Promise<string> {
    if (!contextText.trim()) {
      return 'I could not find that in this codebase.';
    }
    return `[stub answer] Based on the provided context, here is a response to: "${question}"`;
  }
}
