import { chunkByLines } from './line-chunker';
import { TARGET_CHUNK_CHARS } from './chunk.types';

describe('chunkByLines', () => {
  it('returns nothing for empty input', () => {
    expect(chunkByLines('')).toEqual([]);
    expect(chunkByLines('   \n  \n')).toEqual([]);
  });

  it('returns a single chunk covering every line when the text is short', () => {
    const text = 'line one\nline two\nline three';
    const chunks = chunkByLines(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ startLine: 1, endLine: 3, content: text });
  });

  it('always includes at least one line, even if it alone exceeds the target', () => {
    const hugeLine = 'x'.repeat(TARGET_CHUNK_CHARS * 3);
    const chunks = chunkByLines(hugeLine);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(hugeLine);
  });

  it('splits long text into overlapping windows that together cover every line', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `const line${i} = ${i};`);
    const chunks = chunkByLines(lines.join('\n'));

    expect(chunks.length).toBeGreaterThan(1);
    // Every chunk after the first overlaps the tail of the previous one.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startLine).toBeLessThanOrEqual(chunks[i - 1].endLine);
    }
    // The last chunk reaches the end of the file.
    expect(chunks[chunks.length - 1].endLine).toBe(lines.length);
  });

  it('attaches the given symbol name to every produced chunk', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `x${i}`).join('\n');
    const chunks = chunkByLines(lines, 'bigFunction');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.symbol === 'bigFunction')).toBe(true);
  });
});
