import { AppConfig } from './app-config';

const BASE_ENV = {
  DATABASE_URL: 'postgresql://app:app@localhost:5432/codedocs?schema=public',
  LLM_PROVIDER: 'stub',
};

describe('AppConfig', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...BASE_ENV } as NodeJS.ProcessEnv;
  });

  afterAll(() => {
    process.env = original;
  });

  it('applies documented defaults', () => {
    const config = new AppConfig();
    expect(config.port).toBe(3001);
    expect(config.retrieval.topK).toBe(8);
    expect(config.retrieval.contextTokenBudget).toBe(4000);
    expect(config.embedding.dimensions).toBe(384);
  });

  it('fails fast when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    expect(() => new AppConfig()).toThrow(/DATABASE_URL/);
  });

  it('refuses the anthropic provider without an API key', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    expect(() => new AppConfig()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('parses the host allowlist into a normalised list', () => {
    process.env.ALLOWED_REPO_HOSTS = 'GitHub.com, gitlab.com ';
    expect(new AppConfig().ingest.allowedHosts).toEqual(['github.com', 'gitlab.com']);
  });

  it('converts size limits from human units to bytes', () => {
    process.env.MAX_REPO_SIZE_MB = '10';
    process.env.MAX_FILE_SIZE_KB = '64';
    const ingest = new AppConfig().ingest;
    expect(ingest.maxRepoSizeBytes).toBe(10 * 1024 * 1024);
    expect(ingest.maxFileSizeBytes).toBe(64 * 1024);
  });
});
