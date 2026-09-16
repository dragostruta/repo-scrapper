import type { PrismaService } from '../prisma/prisma.service';
import { QueryLogStore } from './query-log.store';

describe('QueryLogStore', () => {
  it('writes one row per answered question', async () => {
    const create = jest.fn().mockResolvedValue({});
    const store = new QueryLogStore({ queryLog: { create } } as unknown as PrismaService);
    const entry = {
      repositoryId: 'r1',
      traceId: 't1',
      question: 'q',
      answer: 'a',
      chunkIds: ['c1', 'c2'],
      scores: [0.9, 0.5],
      timings: { embedQuestion: 1, retrieve: 2, generate: 3, total: 6 },
    };

    await store.record(entry);

    expect(create).toHaveBeenCalledWith({ data: entry });
  });

  it('propagates database failures to the caller', async () => {
    const create = jest.fn().mockRejectedValue(new Error('db down'));
    const store = new QueryLogStore({ queryLog: { create } } as unknown as PrismaService);
    await expect(
      store.record({
        repositoryId: 'r1',
        traceId: 't',
        question: 'q',
        answer: 'a',
        chunkIds: [],
        scores: [],
        timings: { embedQuestion: 0, retrieve: 0, generate: 0, total: 0 },
      }),
    ).rejects.toThrow('db down');
  });
});
