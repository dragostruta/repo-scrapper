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
  MAX_CONCURRENT_INDEXING: z.coerce.number().int().positive().max(16).default(2),
  ALLOWED_REPO_HOSTS: z.string().default('github.com'),
});

export type Env = z.infer<typeof envSchema>;
export type LlmProviderName = Env['LLM_PROVIDER'];

/** Validates raw environment variables, throwing one readable error listing
 * every problem at once rather than failing on the first. */
export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  assertProviderCredentials(parsed.data);
  return parsed.data;
}

function assertProviderCredentials(env: Env): void {
  if (env.LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    throw new Error(
      'LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY. ' +
        'Set it in .env, or use LLM_PROVIDER=ollama to run fully local.',
    );
  }
}

function parseHostList(value: string): string[] {
  return value
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Typed, grouped view of the environment. Every section is built once in
 * the constructor and frozen, so reading config is free and nothing can
 * mutate it at runtime.
 */
@Injectable()
export class AppConfig {
  readonly nodeEnv: Env['NODE_ENV'];
  readonly isProduction: boolean;
  readonly port: number;
  readonly logLevel: Env['LOG_LEVEL'];
  readonly llm;
  readonly embedding;
  readonly retrieval;
  readonly ingest;

  constructor(raw: NodeJS.ProcessEnv = process.env) {
    const env = parseEnv(raw);

    this.nodeEnv = env.NODE_ENV;
    this.isProduction = env.NODE_ENV === 'production';
    this.port = env.API_PORT;
    this.logLevel = env.LOG_LEVEL;

    this.llm = Object.freeze({
      provider: env.LLM_PROVIDER,
      anthropic: Object.freeze({
        apiKey: env.ANTHROPIC_API_KEY ?? '',
        model: env.ANTHROPIC_MODEL,
        maxTokens: env.ANTHROPIC_MAX_TOKENS,
      }),
      ollama: Object.freeze({ baseUrl: env.OLLAMA_BASE_URL, model: env.OLLAMA_MODEL }),
    });

    this.embedding = Object.freeze({
      model: env.EMBEDDING_MODEL,
      dimensions: env.EMBEDDING_DIMENSIONS,
      batchSize: env.EMBEDDING_BATCH_SIZE,
      cacheDir: env.MODEL_CACHE_DIR,
    });

    this.retrieval = Object.freeze({
      topK: env.RETRIEVAL_TOP_K,
      contextTokenBudget: env.CONTEXT_TOKEN_BUDGET,
      keywordBoost: env.KEYWORD_BOOST,
    });

    this.ingest = Object.freeze({
      workspaceDir: env.WORKSPACE_DIR,
      maxRepoSizeBytes: env.MAX_REPO_SIZE_MB * 1024 * 1024,
      maxFiles: env.MAX_FILES,
      maxFileSizeBytes: env.MAX_FILE_SIZE_KB * 1024,
      cloneTimeoutMs: env.CLONE_TIMEOUT_MS,
      maxConcurrentIndexing: env.MAX_CONCURRENT_INDEXING,
      allowedHosts: Object.freeze(parseHostList(env.ALLOWED_REPO_HOSTS)),
    });
  }
}
