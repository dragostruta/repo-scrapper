import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfig } from '../config/app-config';
import { AppLogger } from '../common/logging/logger.service';
import type { LlmAnswerRequest, LlmProvider } from './llm-provider';
import { buildSystemPrompt, buildUserMessage } from './prompt';

/** Maps the SDK's error hierarchy to the same "tell the user what to do
 * about it" shape OllamaProvider uses, instead of letting it fall through to
 * AllExceptionsFilter's generic "Internal server error" - a missing/bad API
 * key or a rate limit is actionable, not a 500. A standalone function
 * (rather than a private method) so it can be unit tested directly against
 * the SDK's real error classes, without mocking the whole client. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function mapAnthropicError(err: unknown): ServiceUnavailableException {
  if (err instanceof Anthropic.AuthenticationError) {
    return new ServiceUnavailableException(
      'Anthropic rejected the API key. Check ANTHROPIC_API_KEY in your .env.',
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ServiceUnavailableException(
      'Anthropic rate-limited this request. Wait a moment and try again.',
    );
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ServiceUnavailableException(
      'Could not reach the Anthropic API. Check your network connection and try again.',
    );
  }
  if (err instanceof Anthropic.APIError) {
    return new ServiceUnavailableException(`Anthropic API error: ${err.message}`);
  }
  const message = err instanceof Error ? err.message : safeStringify(err);
  return new ServiceUnavailableException(`Unexpected error calling Anthropic: ${message}`);
}

@Injectable()
export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly logger;

  constructor(config: AppConfig, logger: AppLogger) {
    const { apiKey, model, maxTokens } = config.llm.anthropic;
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
    this.logger = logger.forContext('AnthropicProvider');
  }

  async answer({ question, contextText, history }: LlmAnswerRequest): Promise<string> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: buildSystemPrompt(),
        messages: [{ role: 'user', content: buildUserMessage(question, contextText, history) }],
      });
    } catch (err) {
      this.logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'anthropic request failed',
      );
      throw mapAnthropicError(err);
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    return textBlock?.text ?? '';
  }
}
