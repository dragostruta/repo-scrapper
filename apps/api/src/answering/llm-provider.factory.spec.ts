import { createFakeLogger } from '../../test/helpers/fake-logger';
import type { AppConfig } from '../config/app-config';
import { AnthropicProvider } from './anthropic.provider';
import { createLlmProvider } from './llm-provider.factory';
import { OllamaProvider } from './ollama.provider';
import { StubLlmProvider } from './stub.provider';

const configFor = (provider: string) =>
  ({
    llm: {
      provider,
      anthropic: { apiKey: 'sk-ant-test', model: 'claude-haiku-4-5', maxTokens: 100 },
      ollama: { baseUrl: 'http://localhost:11434', model: 'qwen2.5-coder:7b' },
    },
  }) as unknown as AppConfig;

describe('createLlmProvider', () => {
  it.each([
    ['anthropic', AnthropicProvider],
    ['ollama', OllamaProvider],
    ['stub', StubLlmProvider],
  ])('builds the %s provider', (name, expected) => {
    expect(createLlmProvider(configFor(name), createFakeLogger())).toBeInstanceOf(expected);
  });

  it('refuses an unknown provider', () => {
    expect(() => createLlmProvider(configFor('gpt'), createFakeLogger())).toThrow(
      /Unknown LLM provider: gpt/,
    );
  });
});
