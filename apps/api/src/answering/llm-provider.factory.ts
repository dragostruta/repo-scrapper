import Anthropic from '@anthropic-ai/sdk';
import type { AppConfig } from '../config/app-config';
import type { AppLogger } from '../common/logging/logger.service';
import { AnthropicProvider } from './anthropic.provider';
import type { LlmProvider } from './llm-provider';
import { OllamaProvider } from './ollama.provider';
import { StubLlmProvider } from './stub.provider';

/** Picks the provider named by LLM_PROVIDER. Adding a provider means one new
 * class and one new case here - nothing that consumes LlmProvider changes. */
export function createLlmProvider(config: AppConfig, logger: AppLogger): LlmProvider {
  const { provider, anthropic, ollama } = config.llm;
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider(
        new Anthropic({ apiKey: anthropic.apiKey }),
        { model: anthropic.model, maxTokens: anthropic.maxTokens },
        logger,
      );
    case 'ollama':
      return new OllamaProvider(ollama, logger);
    case 'stub':
      return new StubLlmProvider();
    default:
      throw new Error(`Unknown LLM provider: ${provider satisfies never}`);
  }
}
