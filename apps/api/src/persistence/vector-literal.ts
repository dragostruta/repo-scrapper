/**
 * pgvector accepts a text literal like '[0.1,0.2,0.3]'::vector. There is no
 * first-class Prisma type for it, so every read and write of the embedding
 * column formats the vector here and passes it as a bound parameter, cast in
 * SQL with `${literal}::vector` (see ChunkStore). Nothing is interpolated
 * into a query string.
 *
 * The finite check is not a SQL-safety measure - binding covers that - it is
 * a correctness one: NaN or Infinity reaching the column means a broken
 * embedding, and failing here points at the model rather than at Postgres.
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
