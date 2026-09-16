import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfig } from '../config/app-config';
import type { LlmAnswerRequest, LlmProvider } from './llm-provider';
import { buildSystemPrompt, buildUserMessage } from './prompt';

@Injectable()
export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: AppConfig) {
    const { apiKey, model, maxTokens } = config.llm.anthropic;
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async answer({ question, contextText }: LlmAnswerRequest): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: buildUserMessage(question, contextText) }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    );
    return textBlock?.text ?? '';
  }
}
