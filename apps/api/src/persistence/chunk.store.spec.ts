import type { PrismaService } from '../prisma/prisma.service';
import { candidatePoolSize, ChunkStore, type ChunkRecord } from './chunk.store';

const record = (i: number): ChunkRecord => ({
  filePath: `src/f${i}.ts`,
  language: 'typescript',
  symbol: null,
  startLine: 1,
  endLine: 2,
  content: `content ${i}`,
  tokenCount: 3,
  embedding: [0.1, 0.2],
});

function setup() {
  const prisma = {
    chunk: { deleteMany: jest.fn(), findFirst: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn(),
    // The real client runs the array in one transaction and returns the
    // results in order; for these tests resolving them is equivalent.
    $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
  };
  return { prisma, store: new ChunkStore(prisma as unknown as PrismaService) };
}

describe('ChunkStore', () => {
  it('deletes every chunk of one repository', async () => {
    const { store, prisma } = setup();
    await store.deleteForRepository('r1');
    expect(prisma.chunk.deleteMany).toHaveBeenCalledWith({ where: { repositoryId: 'r1' } });
  });

  it('inserts in batches of 200 rows', async () => {
    const { store, prisma } = setup();
    await store.insertMany(
      'r1',
      Array.from({ length: 450 }, (_, i) => record(i)),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it('issues no query for an empty insert', async () => {
    const { store, prisma } = setup();
    await store.insertMany('r1', []);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('refuses a record whose embedding contains a non-finite value', async () => {
    const { store, prisma } = setup();
    await expect(store.insertMany('r1', [{ ...record(0), embedding: [NaN] }])).rejects.toThrow(
      /non-finite/,
    );
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  /** The ranking query, as opposed to the ef_search setting that precedes it. */
  function rankingCall(prisma: ReturnType<typeof setup>['prisma']) {
    const call = prisma.$queryRaw.mock.calls.find((c: unknown[]) =>
      (c[0] as string[]).join('').includes('WITH candidates'),
    );
    if (!call) throw new Error('no ranking query was issued');
    return { strings: call[0] as string[], values: call.slice(1) };
  }

  it('search converts the database score (a numeric string) to a number', async () => {
    const { store, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ id: 'c1', score: '0.875' }]);

    const results = await store.search('r1', {
      embedding: [1, 0],
      text: 'login',
      topK: 5,
      keywordBoost: 0.1,
    });

    expect(results).toEqual([{ id: 'c1', score: 0.875 }]);
    expect(rankingCall(prisma).values).toEqual(expect.arrayContaining(['r1', 'login', 5, 0.1]));
  });

  it('widens hnsw.ef_search to the candidate pool in the same transaction', async () => {
    const { store, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([]);

    await store.search('r1', { embedding: [1, 0], text: 'login', topK: 8, keywordBoost: 0.1 });

    // A wider LIMIT alone does not widen the index walk - ef_search caps it.
    const efCall = prisma.$queryRaw.mock.calls.find((c: unknown[]) =>
      (c[0] as string[]).join('').includes('hnsw.ef_search'),
    );
    expect(efCall).toBeDefined();
    expect(efCall!.slice(1)).toContain(String(candidatePoolSize(8)));
    // `true` = local to the transaction, so it cannot leak onto a pooled connection.
    expect((efCall![0] as string[]).join('?')).toContain('true');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('over-fetches candidates so the rerank has something to reorder', () => {
    expect(candidatePoolSize(8)).toBe(80);
  });

  it('caps the candidate pool so a large topK cannot scan the whole table', () => {
    expect(candidatePoolSize(50)).toBe(200);
  });

  it('passes the query vector as a bound parameter, never inlined SQL', async () => {
    const { store, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([]);

    await store.search('r1', { embedding: [1, 0], text: 'login', topK: 5, keywordBoost: 0.1 });

    const { strings, values } = rankingCall(prisma);
    expect(strings.join('')).toContain('::vector');
    expect(strings.join('')).not.toContain('[1,0]');
    expect(values).toContain('[1,0]');
  });

  it('orders by distance alone in the candidate stage so the index is usable', async () => {
    const { store, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([]);

    await store.search('r1', { embedding: [1, 0], text: 'login', topK: 5, keywordBoost: 0.1 });

    const sql = rankingCall(prisma).strings.join('?');
    expect(sql).toMatch(/ORDER BY\s+embedding <=> \?::vector\s+LIMIT/);
    expect(sql).toContain('similarity(content');
  });

  it('findById is scoped to the repository', async () => {
    const { store, prisma } = setup();
    prisma.chunk.findFirst.mockResolvedValue(null);

    expect(await store.findById('r1', 'c1')).toBeNull();
    expect(prisma.chunk.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1', repositoryId: 'r1' } }),
    );
  });
});
