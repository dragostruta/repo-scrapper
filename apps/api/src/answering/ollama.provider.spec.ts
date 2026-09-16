import { createFakeLogger } from '../../test/helpers/fake-logger';
import { LlmUnavailableError } from '../common/errors/domain-errors';
import { buildOllamaChatBody, OllamaProvider } from './ollama.provider';

const SETTINGS = { baseUrl: 'http://ollama:11434', model: 'qwen2.5-coder:7b' };
const REQUEST = { question: 'How does login work?', contextText: 'function login() {}' };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('OllamaProvider', () => {
  it('returns the assistant message content', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(jsonResponse({ message: { content: 'It hashes.' } }));
    const provider = new OllamaProvider(SETTINGS, createFakeLogger(), fetchFn);

    expect(await provider.answer(REQUEST)).toBe('It hashes.');
    expect(fetchFn).toHaveBeenCalledWith(
      'http://ollama:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(buildOllamaChatBody(SETTINGS.model, REQUEST)),
      }),
    );
  });

  it('returns an empty answer when the response has no message', async () => {
    const provider = new OllamaProvider(
      SETTINGS,
      createFakeLogger(),
      jest.fn().mockResolvedValue(jsonResponse({})),
    );
    expect(await provider.answer(REQUEST)).toBe('');
  });

  it('explains how to fix an unreachable Ollama', async () => {
    const logger = createFakeLogger();
    const provider = new OllamaProvider(
      SETTINGS,
      logger,
      jest.fn().mockRejectedValue(new TypeError('fetch failed')),
    );

    const attempt = provider.answer(REQUEST);

    await expect(attempt).rejects.toThrow(LlmUnavailableError);
    await expect(attempt).rejects.toThrow(
      /Could not reach Ollama at http:\/\/ollama:11434.*ollama pull qwen2.5-coder:7b/,
    );
    expect(logger.logs.error).toHaveBeenCalled();
  });

  it('surfaces the status and body of a failed request, truncated', async () => {
    const body = `model "qwen2.5-coder:7b" not found, try pulling it first ${'x'.repeat(1000)}`;
    const fetchFn = jest.fn().mockResolvedValue(new Response(body, { status: 404 }));
    const provider = new OllamaProvider(SETTINGS, createFakeLogger(), fetchFn);

    const error = (await provider.answer(REQUEST).catch((e: unknown) => e)) as Error;

    expect(error).toBeInstanceOf(LlmUnavailableError);
    expect(error.message).toMatch(/^Ollama returned 404: model "qwen2.5-coder:7b" not found/);
    expect(error.message.length).toBeLessThanOrEqual('Ollama returned 404: '.length + 500);
  });
});

describe('buildOllamaChatBody', () => {
  it('sends a non-streaming chat with the system prompt first', () => {
    const body = buildOllamaChatBody('m', REQUEST);
    expect(body.model).toBe('m');
    expect(body.stream).toBe(false);
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(body.messages[1].content).toContain('How does login work?');
  });
});
