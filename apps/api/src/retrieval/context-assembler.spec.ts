import { assembleContext } from './context-assembler';
import type { RetrievedChunk } from './chunk-repository.service';

function chunk(overrides: Partial<RetrievedChunk> & { score: number }): RetrievedChunk {
  return {
    id: 'c1',
    filePath: 'src/a.ts',
    language: 'typescript',
    symbol: null,
    startLine: 1,
    endLine: 1,
    content: 'x',
    ...overrides,
  };
}

describe('assembleContext', () => {
  it('keeps every chunk when the total is under budget', () => {
    const chunks = [chunk({ score: 0.9, content: 'a'.repeat(40) }), chunk({ score: 0.8, content: 'b'.repeat(40) })];
    const result = assembleContext(chunks, 1000);
    expect(result.chunks).toHaveLength(2);
    expect(result.text).toContain('src/a.ts');
  });

  it('drops the lowest-scoring chunks first once the budget is exceeded', () => {
    const big = 'x'.repeat(400); // ~100 tokens each
    const chunks = [
      chunk({ id: 'high', score: 0.9, content: big }),
      chunk({ id: 'mid', score: 0.7, content: big }),
      chunk({ id: 'low', score: 0.5, content: big }),
    ];
    // Budget for roughly 2 chunks' worth of tokens.
    const result = assembleContext(chunks, 220);
    const keptIds = result.chunks.map((c) => c.id);
    expect(keptIds).toEqual(['high', 'mid']);
    expect(keptIds).not.toContain('low');
  });

  it('always keeps at least one chunk even if it alone exceeds the budget', () => {
    const chunks = [chunk({ id: 'only', score: 0.9, content: 'x'.repeat(10_000) })];
    const result = assembleContext(chunks, 10);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].id).toBe('only');
  });

  it('returns empty output for no chunks', () => {
    const result = assembleContext([], 1000);
    expect(result.chunks).toEqual([]);
    expect(result.text).toBe('');
    expect(result.estimatedTokens).toBe(0);
  });

  it('includes the symbol name in the formatted block when present', () => {
    const result = assembleContext([chunk({ score: 0.9, symbol: 'myFunction', content: 'body' })], 1000);
    expect(result.text).toContain('(myFunction)');
  });
});
