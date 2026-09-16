import { AppConfig, parseEnv } from './app-config';

const BASE_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://app:app@localhost:5432/codedocs?schema=public',
  LLM_PROVIDER: 'stub',
};

const withEnv = (overrides: NodeJS.ProcessEnv) => new AppConfig({ ...BASE_ENV, ...overrides });

describe('AppConfig', () => {
  it('applies documented defaults', () => {
    const config = withEnv({});
    expect(config.port).toBe(3001);
    expect(config.nodeEnv).toBe('development');
    expect(config.isProduction).toBe(false);
    expect(config.retrieval).toEqual({ topK: 8, contextTokenBudget: 4000, keywordBoost: 0.15 });
    expect(config.embedding.dimensions).toBe(384);
    expect(config.llm.ollama).toEqual({
      baseUrl: 'http://localhost:11434',
      model: 'qwen2.5-coder:7b',
    });
  });

  it('coerces numeric env strings', () => {
    const config = withEnv({ API_PORT: '8080', RETRIEVAL_TOP_K: '12', KEYWORD_BOOST: '0' });
    expect(config.port).toBe(8080);
    expect(config.retrieval.topK).toBe(12);
    expect(config.retrieval.keywordBoost).toBe(0);
  });

  it('parses the host allowlist into a normalised list, dropping blanks', () => {
    expect(
      withEnv({ ALLOWED_REPO_HOSTS: 'GitHub.com, gitlab.com ,,' }).ingest.allowedHosts,
    ).toEqual(['github.com', 'gitlab.com']);
  });

  it('converts size limits from human units to bytes', () => {
    const { ingest } = withEnv({ MAX_REPO_SIZE_MB: '10', MAX_FILE_SIZE_KB: '64' });
    expect(ingest.maxRepoSizeBytes).toBe(10 * 1024 * 1024);
    expect(ingest.maxFileSizeBytes).toBe(64 * 1024);
  });

  it('exposes frozen sections that cannot be mutated at runtime', () => {
    const config = withEnv({});
    expect(Object.isFrozen(config.retrieval)).toBe(true);
    expect(Object.isFrozen(config.ingest.allowedHosts)).toBe(true);
  });

  it('flags production mode', () => {
    expect(withEnv({ NODE_ENV: 'production' }).isProduction).toBe(true);
  });

  it('accepts ollama without any API key', () => {
    expect(withEnv({ LLM_PROVIDER: 'ollama' }).llm.provider).toBe('ollama');
  });
});

describe('parseEnv', () => {
  it('fails fast when DATABASE_URL is missing', () => {
    expect(() => parseEnv({ LLM_PROVIDER: 'stub' })).toThrow(/DATABASE_URL/);
  });

  it('reports every invalid variable at once', () => {
    const attempt = () =>
      parseEnv({ ...BASE_ENV, LLM_PROVIDER: 'openai', KEYWORD_BOOST: '5', API_PORT: '-1' });
    expect(attempt).toThrow(/LLM_PROVIDER/);
    expect(attempt).toThrow(/KEYWORD_BOOST/);
    expect(attempt).toThrow(/API_PORT/);
  });

  it('rejects a top-K above the ceiling', () => {
    expect(() => parseEnv({ ...BASE_ENV, RETRIEVAL_TOP_K: '51' })).toThrow(/RETRIEVAL_TOP_K/);
  });

  it('refuses the anthropic provider without an API key', () => {
    expect(() => parseEnv({ ...BASE_ENV, LLM_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() =>
      parseEnv({ ...BASE_ENV, LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '' }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('accepts anthropic once a key is present', () => {
    expect(
      parseEnv({ ...BASE_ENV, LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-x' })
        .LLM_PROVIDER,
    ).toBe('anthropic');
  });
});
