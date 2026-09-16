import { createFakeLogger } from '../../test/helpers/fake-logger';
import type { AppConfig } from '../config/app-config';
import { LocalEmbeddingProvider, unflatten } from './local-embedding.provider';

const extractor = jest.fn();
const pipelineFactory = jest.fn(async () => extractor);
const transformersEnv: Record<string, unknown> = {};

jest.mock('@huggingface/transformers', () => ({
  pipeline: (...args: unknown[]) => pipelineFactory(...(args as [])),
  env: transformersEnv,
}));

const config = {
  embedding: { model: 'test/model', dimensions: 2, batchSize: 2, cacheDir: '/tmp/models' },
} as unknown as AppConfig;

describe('unflatten', () => {
  it('splits a flat batch tensor into one vector per input', () => {
    expect(unflatten(new Float32Array([1, 2, 3, 4, 5, 6]), [3, 2])).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it('returns no vectors for an empty batch', () => {
    expect(unflatten([], [0, 384])).toEqual([]);
  });
});

describe('LocalEmbeddingProvider', () => {
  beforeEach(() => {
    extractor.mockReset();
    pipelineFactory.mockClear();
    // Each call returns [batchSize x 2] vectors whose values encode the batch.
    extractor.mockImplementation(async (texts: string[]) => ({
      data: texts.flatMap((_, i) => [texts.length, i]),
      dims: [texts.length, 2],
    }));
  });

  it('exposes the configured dimensions', () => {
    expect(new LocalEmbeddingProvider(config, createFakeLogger()).dimensions).toBe(2);
  });

  it('does not load the model for an empty input', async () => {
    const provider = new LocalEmbeddingProvider(config, createFakeLogger());
    expect(await provider.embed([])).toEqual([]);
    expect(pipelineFactory).not.toHaveBeenCalled();
  });

  it('embeds in batches of EMBEDDING_BATCH_SIZE and preserves input order', async () => {
    const provider = new LocalEmbeddingProvider(config, createFakeLogger());

    const vectors = await provider.embed(['a', 'b', 'c', 'd', 'e']);

    expect(extractor).toHaveBeenCalledTimes(3);
    expect(extractor.mock.calls.map(([texts]) => texts)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(extractor).toHaveBeenCalledWith(['a', 'b'], { pooling: 'mean', normalize: true });
    expect(vectors).toEqual([
      [2, 0],
      [2, 1],
      [2, 0],
      [2, 1],
      [1, 0],
    ]);
  });

  it('loads the model once, even for concurrent callers, using the cache dir', async () => {
    const provider = new LocalEmbeddingProvider(config, createFakeLogger());

    await Promise.all([provider.embed(['x']), provider.embed(['y']), provider.onModuleInit()]);

    expect(pipelineFactory).toHaveBeenCalledTimes(1);
    expect(pipelineFactory).toHaveBeenCalledWith('feature-extraction', 'test/model');
    expect(transformersEnv.cacheDir).toBe('/tmp/models');
    expect(transformersEnv.allowLocalModels).toBe(false);
  });
});
