import type { AppLogger } from '../common/logging/logger.service';
import { LlmUnavailableError } from '../common/errors/domain-errors';
import { errorMessage } from '../common/errors/error-message';
import type { LlmAnswerRequest, LlmProvider } from './llm-provider';
import { buildPromptMessages } from './prompt';

export interface OllamaSettings {
  baseUrl: string;
  model: string;
}

interface OllamaChatResponse {
  message?: { content?: string };
}

/** Longest upstream error body echoed back to the user. */
const MAX_ERROR_BODY = 500;

/** Request body for Ollama's non-streaming /api/chat endpoint. */
export function buildOllamaChatBody(model: string, request: LlmAnswerRequest) {
  const { system, user } = buildPromptMessages(request);
  return {
    model,
    stream: false,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
}

/**
 * Talks to a local or docker-composed Ollama over /api/chat. No API key and no
 * external network call. `fetchFn` is injectable so tests never need a server.
 */
export class OllamaProvider implements LlmProvider {
  private readonly logger;

  constructor(
    private readonly settings: OllamaSettings,
    logger: AppLogger,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    this.logger = logger.forContext('OllamaProvider');
  }

  async answer(request: LlmAnswerRequest): Promise<string> {
    const response = await this.postChat(request);
    await this.assertOk(response);
    return this.readAnswer(response);
  }

  private async postChat(request: LlmAnswerRequest): Promise<Response> {
    const { baseUrl, model } = this.settings;
    try {
      return await this.fetchFn(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildOllamaChatBody(model, request)),
      });
    } catch (err) {
      this.logger.error({ baseUrl, model, err: errorMessage(err) }, 'could not reach ollama');
      throw new LlmUnavailableError(
        `Could not reach Ollama at ${baseUrl}. Is it running (\`ollama serve\`) and is ` +
          `"${model}" pulled (\`ollama pull ${model}\`)?`,
      );
    }
  }

  private async assertOk(response: Response): Promise<void> {
    if (response.ok) return;
    const body = await response.text().catch(() => '');
    throw new LlmUnavailableError(
      `Ollama returned ${response.status}: ${body.slice(0, MAX_ERROR_BODY)}`,
    );
  }

  private async readAnswer(response: Response): Promise<string> {
    const data = (await response.json()) as OllamaChatResponse;
    return data.message?.content ?? '';
  }
}
