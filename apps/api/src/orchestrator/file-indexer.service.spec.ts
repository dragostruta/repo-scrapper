import { aChunkCandidate, aWalkedFile } from '../../test/helpers/builders';
import type { ChunkerService } from '../chunking/chunker.service';
import type { EmbeddingProvider } from '../embedding/embedding-provider';
import type { ChunkStore } from '../persistence/chunk.store';
import { FileIndexerService, toChunkRecords } from './file-indexer.service';

describe('toChunkRecords', () => {
  it('pairs each chunk with its vector and file metadata', () => {
    const records = toChunkRecords(
      aWalkedFile(),
      [
        aChunkCandidate({ content: 'abcdefgh', startLine: 1, endLine: 2 }),
        aChunkCandidate({ symbol: null }),
      ],
      [[1], [2]],
    );
    expect(records[0]).toEqual({
      filePath: 'src/auth.ts',
      language: 'typescript',
      symbol: 'login',
      startLine: 1,
      endLine: 2,
      content: 'abcdefgh',
      tokenCount: 2,
      embedding: [1],
    });
    expect(records[1]).toMatchObject({ symbol: null, embedding: [2] });
  });

  it('refuses mismatched chunk and vector counts instead of misaligning them', () => {
    expect(() => toChunkRecords(aWalkedFile(), [aChunkCandidate()], [])).toThrow(/mismatch/);
  });
});

describe('FileIndexerService', () => {
  function setup(
    candidates = [aChunkCandidate({ content: 'one' }), aChunkCandidate({ content: 'two' })],
  ) {
    const chunker = { chunkFile: jest.fn().mockResolvedValue(candidates) };
    const embeddings: EmbeddingProvider = {
      dimensions: 1,
      embed: jest.fn(async (texts: string[]) => texts.map((_, i) => [i])),
    };
    const chunks = { insertMany: jest.fn() };
    const service = new FileIndexerService(
      chunker as unknown as ChunkerService,
      embeddings,
      chunks as unknown as ChunkStore,
    );
    return { service, chunker, embeddings, chunks };
  }

  it('chunks, embeds and stores a file, returning the chunk count', async () => {
    const { service, chunker, embeddings, chunks } = setup();
    const file = aWalkedFile({ content: 'source', language: 'python' });

    expect(await service.indexFile('r1', file)).toBe(2);

    expect(chunker.chunkFile).toHaveBeenCalledWith('source', 'python');
    expect(embeddings.embed).toHaveBeenCalledWith(['one', 'two']);
    expect(chunks.insertMany).toHaveBeenCalledWith('r1', [
      expect.objectContaining({ content: 'one', embedding: [0] }),
      expect.objectContaining({ content: 'two', embedding: [1] }),
    ]);
  });

  it('does no embedding or storage work for a file with no chunks', async () => {
    const { service, embeddings, chunks } = setup([]);
    expect(await service.indexFile('r1', aWalkedFile())).toBe(0);
    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(chunks.insertMany).not.toHaveBeenCalled();
  });

  it('stores nothing when embedding fails', async () => {
    const { service, embeddings, chunks } = setup();
    (embeddings.embed as jest.Mock).mockRejectedValue(new Error('onnx crashed'));
    await expect(service.indexFile('r1', aWalkedFile())).rejects.toThrow('onnx crashed');
    expect(chunks.insertMany).not.toHaveBeenCalled();
  });
});
