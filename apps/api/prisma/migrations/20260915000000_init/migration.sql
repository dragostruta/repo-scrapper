-- pgvector must exist before any vector column is created.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "RepositorySource" AS ENUM ('GITHUB', 'UPLOAD');
CREATE TYPE "RepositoryStatus" AS ENUM ('PENDING', 'CLONING', 'INDEXING', 'INDEXED', 'FAILED');

CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "source" "RepositorySource" NOT NULL,
    "url" TEXT,
    "name" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "status" "RepositoryStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "indexedAt" TIMESTAMP(3),

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "repositories_source_name_revision_key"
    ON "repositories"("source", "name", "revision");
CREATE INDEX "repositories_status_idx" ON "repositories"("status");

CREATE TABLE "chunks" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "symbol" TEXT,
    "startLine" INTEGER NOT NULL,
    "endLine" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "embedding" vector(384),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chunks_repositoryId_idx" ON "chunks"("repositoryId");
CREATE INDEX "chunks_repositoryId_filePath_idx" ON "chunks"("repositoryId", "filePath");

-- HNSW over cosine distance. Built on an empty table here; pgvector fills it
-- incrementally as chunks are inserted, which is fine at our scale.
--
-- This index is only reachable because ChunkStore.search orders its candidate
-- stage by `embedding <=> $1` and nothing else. Blending the keyword boost
-- into that ORDER BY - the obvious way to write hybrid search - makes the
-- expression non-indexable and silently turns every query into a full scan,
-- which is why the rerank happens in a second stage over the candidates.
CREATE INDEX "chunks_embedding_hnsw_idx"
    ON "chunks" USING hnsw ("embedding" vector_cosine_ops);

-- No GIN trigram index on "content" on purpose. The keyword boost calls
-- similarity() in a SELECT expression, and GIN can only serve the `%`
-- operator in a WHERE clause - so such an index would be written on every
-- insert and read by nothing. The rerank stage runs over at most a few
-- hundred candidate rows, where a sequential similarity() is cheap.
-- pg_trgm itself is still required: similarity() is its function.

CREATE TABLE "query_logs" (
    "id" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "chunkIds" TEXT[],
    "scores" DOUBLE PRECISION[],
    "timings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "query_logs_repositoryId_createdAt_idx" ON "query_logs"("repositoryId", "createdAt");
CREATE INDEX "query_logs_traceId_idx" ON "query_logs"("traceId");

ALTER TABLE "chunks" ADD CONSTRAINT "chunks_repositoryId_fkey"
    FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "query_logs" ADD CONSTRAINT "query_logs_repositoryId_fkey"
    FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
