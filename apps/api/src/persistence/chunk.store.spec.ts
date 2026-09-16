import type { PrismaService } from '../prisma/prisma.service';
import { ChunkStore, type ChunkRecord } from './chunk.store';

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
    const sql = prisma.$queryRaw.mock.calls[0];
    expect(sql.flat()).toEqual(expect.arrayContaining(['r1', 'login', 5, 0.1]));
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
