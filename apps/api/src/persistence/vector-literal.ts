/**
 * pgvector accepts a text literal like '[0.1,0.2,0.3]'::vector. There is no
 * first-class Prisma type for it, so every read and write of the embedding
 * column goes through raw SQL with this literal built by hand rather than
 * relying on Prisma's parameter binding.
 *
 * Safe to inline directly into a SQL string (see ChunkStore) because the
 * input is always a program-generated embedding, never user text - every
 * value is checked to be finite, so nothing here can smuggle in arbitrary SQL.
 */
export function toVectorLiteral(embedding: number[]): string {
  const values = embedding.map((n) => {
    if (!Number.isFinite(n)) {
      throw new Error('Embedding vector contains a non-finite value');
    }
    return n.toString();
  });
  return `[${values.join(',')}]`;
}
