/**
 * Everything above the model boundary depends on this interface, never on
 * transformers.js directly - that is what makes "swap the embedding model"
 * a config-and-migration change (D3/D4) instead of a rewrite.
 */
export interface EmbeddingProvider {
  /** Fixed output width. Must match the schema's vector(N) column. */
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');
