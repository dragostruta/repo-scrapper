import Anthropic from '@anthropic-ai/sdk';
import type { AppLogger } from '../common/logging/logger.service';
import { LlmUnavailableError } from '../common/errors/domain-errors';
import { errorMessage } from '../common/errors/error-message';
import type { LlmAnswerRequest, LlmProvider } from './llm-provider';
import { buildPromptMessages } from './prompt';

export interface AnthropicSettings {
  model: string;
  maxTokens: number;
}

/** The one SDK method this provider uses - lets tests pass a small fake. */
export interface AnthropicMessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

/**
 * Maps the SDK's error hierarchy to actionable messages. A bad key or a rate
 * limit is something the user can fix, not an opaque 500.
 */
export function mapAnthropicError(err: unknown): LlmUnavailableError {
  if (err instanceof Anthropic.AuthenticationError) {
    return new LlmUnavailableError(
      'Anthropic rejected the API key. Check ANTHROPIC_API_KEY in your .env.',
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LlmUnavailableError(
      'Anthropic rate-limited this request. Wait a moment and try again.',
    );
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new LlmUnavailableError(
      'Could not reach the Anthropic API. Check your network connection and try again.',
    );
  }
  if (err instanceof Anthropic.APIError) {
    return new LlmUnavailableError(`Anthropic API error: ${err.message}`);
  }
  return new LlmUnavailableError(`Unexpected error calling Anthropic: ${errorMessage(err)}`);
}

/** Concatenated text of every text block in a response; '' if there are none. */
export function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export class AnthropicProvider implements LlmProvider {
  private readonly logger;

  constructor(
    private readonly client: AnthropicMessagesClient,
    private readonly settings: AnthropicSettings,
    logger: AppLogger,
  ) {
    this.logger = logger.forContext('AnthropicProvider');
  }

  async answer(request: LlmAnswerRequest): Promise<string> {
    const message = await this.createMessage(request);
    return extractText(message);
  }

  private async createMessage(request: LlmAnswerRequest): Promise<Anthropic.Message> {
    const { system, user } = buildPromptMessages(request);
    try {
      return await this.client.messages.create({
        model: this.settings.model,
        max_tokens: this.settings.maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      });
    } catch (err) {
      this.logger.error({ err: errorMessage(err) }, 'anthropic request failed');
      throw mapAnthropicError(err);
    }
  }
}
