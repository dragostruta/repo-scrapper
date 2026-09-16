import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * Environment is parsed and validated exactly once, at boot.
 *
 * A misconfigured container should fail immediately with a readable message
 * rather than 40 minutes later, in the middle of indexing, with
 * "undefined is not a number".
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),

  // --- LLM ---
  LLM_PROVIDER: z.enum(['anthropic', 'ollama', 'stub']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-haiku-4-5'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('qwen2.5-coder:7b'),

  // --- Embeddings ---
  EMBEDDING_MODEL: z.string().default('Xenova/bge-small-en-v1.5'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(384),
  EMBEDDING_BATCH_SIZE: z.coerce.number().int().positive().default(16),
  MODEL_CACHE_DIR: z.string().default('./.cache/models'),

  // --- Retrieval ---
  RETRIEVAL_TOP_K: z.coerce.number().int().positive().max(50).default(8),
  CONTEXT_TOKEN_BUDGET: z.coerce.number().int().positive().default(4000),
  KEYWORD_BOOST: z.coerce.number().min(0).max(1).default(0.15),

  // --- Ingest guardrails ---
  WORKSPACE_DIR: z.string().default('./.cache/repos'),
  MAX_REPO_SIZE_MB: z.coerce.number().int().positive().default(200),
  MAX_FILES: z.coerce.number().int().positive().default(5000),
  MAX_FILE_SIZE_KB: z.coerce.number().int().positive().default(512),
  CLONE_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  ALLOWED_REPO_HOSTS: z.string().default('github.com'),
});

export type Env = z.infer<typeof envSchema>;

@Injectable()
export class AppConfig {
  private readonly env: Env;

  constructor() {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    this.env = parsed.data;

    if (this.env.LLM_PROVIDER === 'anthropic' && !this.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY. ' +
          'Set it in .env, or use LLM_PROVIDER=ollama to run fully local.',
      );
    }
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.env.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get port(): number {
    return this.env.API_PORT;
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.env.LOG_LEVEL;
  }

  get llm() {
    return {
      provider: this.env.LLM_PROVIDER,
      anthropic: {
        apiKey: this.env.ANTHROPIC_API_KEY ?? '',
        model: this.env.ANTHROPIC_MODEL,
        maxTokens: this.env.ANTHROPIC_MAX_TOKENS,
      },
      ollama: {
        baseUrl: this.env.OLLAMA_BASE_URL,
        model: this.env.OLLAMA_MODEL,
      },
    } as const;
  }

  get embedding() {
    return {
      model: this.env.EMBEDDING_MODEL,
      dimensions: this.env.EMBEDDING_DIMENSIONS,
      batchSize: this.env.EMBEDDING_BATCH_SIZE,
      cacheDir: this.env.MODEL_CACHE_DIR,
    } as const;
  }

  get retrieval() {
    return {
      topK: this.env.RETRIEVAL_TOP_K,
      contextTokenBudget: this.env.CONTEXT_TOKEN_BUDGET,
      keywordBoost: this.env.KEYWORD_BOOST,
    } as const;
  }

  get ingest() {
    return {
      workspaceDir: this.env.WORKSPACE_DIR,
      maxRepoSizeBytes: this.env.MAX_REPO_SIZE_MB * 1024 * 1024,
      maxFiles: this.env.MAX_FILES,
      maxFileSizeBytes: this.env.MAX_FILE_SIZE_KB * 1024,
      cloneTimeoutMs: this.env.CLONE_TIMEOUT_MS,
      allowedHosts: this.env.ALLOWED_REPO_HOSTS.split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    } as const;
  }
}
