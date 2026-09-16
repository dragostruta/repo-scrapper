import { Injectable, OnModuleInit } from '@nestjs/common';
import { AppConfig } from '../config/app-config';
import { AppLogger } from '../common/logging/logger.service';
import type { EmbeddingProvider } from './embedding-provider';

/** transformers.js is ESM-only and untyped from our side - dynamically
 * imported below, cast through this narrow `unknown` surface. */
type FeatureExtractionPipeline = (
  texts: string[],
  options: { pooling: 'mean'; normalize: true },
) => Promise<{ data: Float32Array | number[]; dims: number[] }>;

/**
 * Runs bge-small-en-v1.5 in-process via transformers.js/ONNX Runtime, CPU
 * only. The model is downloaded once to MODEL_CACHE_DIR on first use (~130MB)
 * and reused after that - see D3 for why this is local rather than hosted.
 */
@Injectable()
export class LocalEmbeddingProvider implements EmbeddingProvider, OnModuleInit {
  readonly dimensions: number;

  private readonly logger;
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(
    private readonly config: AppConfig,
    logger: AppLogger,
  ) {
    this.dimensions = config.embedding.dimensions;
    this.logger = logger.forContext('LocalEmbeddingProvider');
  }

  /** Warms the model at boot so the first real request isn't the one that
   * pays the download/load latency. */
  async onModuleInit(): Promise<void> {
    await this.getPipeline();
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const pipeline = await this.getPipeline();
    const { batchSize } = this.config.embedding;
    const out: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const result = await pipeline(batch, { pooling: 'mean', normalize: true });
      out.push(...unflatten(result.data, result.dims));
    }
    return out;
  }

  private getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = this.loadPipeline();
    }
    return this.pipelinePromise;
  }

  /** dtype left unset - transformers.js v3+ replaced the old boolean
   * `quantized` option with `dtype`; the library's own default is safer than
   * guessing a literal that might not match the installed version. */
  private async loadPipeline(): Promise<FeatureExtractionPipeline> {
    const startedAt = Date.now();
    const { pipeline, env } = await import('@huggingface/transformers');

    env.cacheDir = this.config.embedding.cacheDir;
    // We ship no local ONNX files - always resolve from the Hub cache dir.
    env.allowLocalModels = false;

    const model = this.config.embedding.model;
    this.logger.info({ model }, 'loading embedding model (first call may download it)');

    const extractor = (await pipeline(
      'feature-extraction',
      model,
    )) as unknown as FeatureExtractionPipeline;

    this.logger.info({ model, ms: Date.now() - startedAt }, 'embedding model ready');
    return extractor;
  }
}

/** transformers.js returns a flat [batch * dims] tensor; split it back into
 * one vector per input string. */
function unflatten(data: Float32Array | number[], dims: number[]): number[][] {
  const [batch, width] = dims;
  const out: number[][] = [];
  for (let i = 0; i < batch; i++) {
    out.push(Array.from(data.slice(i * width, (i + 1) * width)));
  }
  return out;
}
