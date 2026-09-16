import Anthropic from '@anthropic-ai/sdk';
import { createFakeLogger } from '../../test/helpers/fake-logger';
import { LlmUnavailableError } from '../common/errors/domain-errors';
import {
  type AnthropicMessagesClient,
  AnthropicProvider,
  extractText,
  mapAnthropicError,
} from './anthropic.provider';
import { buildSystemPrompt } from './prompt';

const message = (content: Anthropic.ContentBlock[]) =>
  ({ content }) as unknown as Anthropic.Message;
const text = (value: string) =>
  ({ type: 'text', text: value, citations: null }) as Anthropic.TextBlock;

describe('AnthropicProvider', () => {
  const build = (create: jest.Mock) =>
    new AnthropicProvider(
      { messages: { create } } as AnthropicMessagesClient,
      { model: 'claude-haiku-4-5', maxTokens: 512 },
      createFakeLogger(),
    );

  it('sends the grounded prompt and returns the answer text', async () => {
    const create = jest.fn().mockResolvedValue(message([text('Login hashes the password.')]));

    const answer = await build(create).answer({ question: 'How?', contextText: 'code' });

    expect(answer).toBe('Login hashes the password.');
    expect(create).toHaveBeenCalledWith({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: buildSystemPrompt(),
      messages: [{ role: 'user', content: expect.stringContaining('Question: How?') }],
    });
  });

  it('maps SDK failures to a readable LlmUnavailableError', async () => {
    const create = jest
      .fn()
      .mockRejectedValue(new Anthropic.APIConnectionError({ message: 'down' }));
    await expect(build(create).answer({ question: 'q', contextText: 'c' })).rejects.toThrow(
      /Could not reach the Anthropic API/,
    );
  });
});

describe('extractText', () => {
  it('joins every text block and skips other block types', () => {
    const toolUse = { type: 'tool_use', id: 't', name: 'x', input: {} } as Anthropic.ToolUseBlock;
    expect(extractText(message([text('Hello '), toolUse, text('world')]))).toBe('Hello world');
  });

  it('returns an empty string when there is no text', () => {
    expect(extractText(message([]))).toBe('');
  });
});

describe('mapAnthropicError', () => {
  it('gives an actionable message for a bad or missing API key', () => {
    const err = new Anthropic.AuthenticationError(
      401,
      { message: 'invalid x-api-key' },
      'invalid x-api-key',
      new Headers(),
    );
    const mapped = mapAnthropicError(err);
    expect(mapped).toBeInstanceOf(LlmUnavailableError);
    expect(mapped.message).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('gives an actionable message for a rate limit', () => {
    const err = new Anthropic.RateLimitError(
      429,
      { message: 'rate limited' },
      'rate limited',
      new Headers(),
    );
    expect(mapAnthropicError(err).message).toMatch(/rate-limited/i);
  });

  it('gives an actionable message for a connection failure', () => {
    expect(
      mapAnthropicError(new Anthropic.APIConnectionError({ message: 'fetch failed' })).message,
    ).toMatch(/could not reach/i);
  });

  it('keeps the detail of any other API error', () => {
    const err = new Anthropic.InternalServerError(
      500,
      { message: 'overloaded' },
      'overloaded',
      new Headers(),
    );
    expect(mapAnthropicError(err).message).toMatch(/^Anthropic API error: .*overloaded/);
  });

  it('falls back to a readable message for an unrecognised error', () => {
    expect(mapAnthropicError(new Error('something else broke')).message).toContain(
      'something else broke',
    );
  });

  it('never produces "[object Object]" for a non-Error value', () => {
    expect(mapAnthropicError({ weird: 'shape' }).message).not.toContain('[object Object]');
  });
});
