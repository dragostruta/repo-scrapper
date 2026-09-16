import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { AppLogger } from '../common/logging/logger.service';
import type { LlmAnswerRequest, LlmProvider } from './llm-provider';
import { buildSystemPrompt, buildUserMessage } from './prompt';

interface OllamaChatResponse {
  message?: { content?: string };
}

/** Talks to a local (or docker-composed) Ollama instance over its /api/chat
 * endpoint. No API key, no external network call - see the README's "Running
 * fully local" section. */
@Injectable()
export class OllamaProvider implements LlmProvider {
  private readonly logger;

  constructor(
    private readonly config: AppConfig,
    logger: AppLogger,
  ) {
    this.logger = logger.forContext('OllamaProvider');
  }

  async answer({ question, contextText }: LlmAnswerRequest): Promise<string> {
    const { baseUrl, model } = this.config.llm.ollama;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: buildUserMessage(question, contextText) },
          ],
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ baseUrl, model, err: message }, 'could not reach ollama');
      throw new ServiceUnavailableException(
        `Could not reach Ollama at ${baseUrl}. Is it running (\`ollama serve\`) and is ` +
          `"${model}" pulled (\`ollama pull ${model}\`)?`,
      );
    }

    if (!response.ok) {
      const body = await response.text();
      throw new ServiceUnavailableException(`Ollama returned ${response.status}: ${body.slice(0, 500)}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    return data.message?.content ?? '';
  }
}
