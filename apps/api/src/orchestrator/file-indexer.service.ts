import { Inject, Injectable } from '@nestjs/common';
import { estimateTokens } from '../common/tokens';
import { ChunkerService } from '../chunking/chunker.service';
import type { ChunkCandidate } from '../chunking/chunk.types';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../embedding/embedding-provider';
import type { WalkedFile } from '../ingest/file-walker.service';
import { ChunkStore, type ChunkRecord } from '../persistence/chunk.store';

/** Pairs each chunk of a file with its embedding. */
export function toChunkRecords(
  file: WalkedFile,
  candidates: ChunkCandidate[],
  vectors: number[][],
): ChunkRecord[] {
  if (vectors.length !== candidates.length) {
    throw new Error(
      `Embedding count mismatch for ${file.relativePath}: ` +
        `${candidates.length} chunks but ${vectors.length} vectors.`,
    );
  }
  return candidates.map((candidate, i) => ({
    filePath: file.relativePath,
    language: file.language,
    symbol: candidate.symbol,
    startLine: candidate.startLine,
    endLine: candidate.endLine,
    content: candidate.content,
    tokenCount: estimateTokens(candidate.content),
    embedding: vectors[i],
  }));
}

/** Turns one file into stored, searchable chunks: chunk -> embed -> insert. */
@Injectable()
export class FileIndexerService {
  constructor(
    private readonly chunker: ChunkerService,
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    private readonly chunks: ChunkStore,
  ) {}

  /** Returns how many chunks were stored for the file (0 for an empty one). */
  async indexFile(repositoryId: string, file: WalkedFile): Promise<number> {
    const candidates = await this.chunker.chunkFile(file.content, file.language);
    if (candidates.length === 0) return 0;

    const vectors = await this.embeddings.embed(candidates.map((c) => c.content));
    await this.chunks.insertMany(repositoryId, toChunkRecords(file, candidates, vectors));
    return candidates.length;
  }
}
