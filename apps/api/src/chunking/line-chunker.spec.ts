import { chunkByLines, nextWindowStart, overlapLines, windowEnd } from './line-chunker';
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
    // Same shape as the "splits long text" fixture above - long enough per
    // line that the joined text clears TARGET_CHUNK_CHARS and actually
    // splits. A prior version of this fixture (short "x0".."x199" lines,
    // ~900 chars total) stayed under the threshold and produced a single
    // chunk, so the >1 assertion below was untested.
    const lines = Array.from({ length: 200 }, (_, i) => `const line${i} = ${i};`).join('\n');
    const chunks = chunkByLines(lines, 'bigFunction');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.symbol === 'bigFunction')).toBe(true);
  });
});

describe('chunkByLines edge cases', () => {
  it('terminates when a line over the target is followed by more lines (regression)', () => {
    // Previously a one-line window overlapped itself entirely and looped forever.
    const text = `${'x'.repeat(TARGET_CHUNK_CHARS + 100)}\nshort\nlast`;
    const chunks = chunkByLines(text);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.at(-1)!.endLine).toBe(3);
  });

  it('handles several consecutive oversized lines', () => {
    const line = 'y'.repeat(TARGET_CHUNK_CHARS * 2);
    const chunks = chunkByLines([line, line, line].join('\n'));
    expect(chunks.map((c) => [c.startLine, c.endLine])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it('keeps every chunk within reach of the target size', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `line ${i} ${'z'.repeat(40)}`);
    for (const chunk of chunkByLines(lines.join('\n'))) {
      expect(chunk.content.length).toBeLessThan(TARGET_CHUNK_CHARS + 60);
    }
  });

  it('defaults the symbol to null', () => {
    expect(chunkByLines('a\nb')[0].symbol).toBeNull();
  });
});

describe('window helpers', () => {
  it('windowEnd always takes at least one line', () => {
    expect(windowEnd(['x'.repeat(TARGET_CHUNK_CHARS * 5)], 0)).toBe(1);
  });

  it('windowEnd stops at the end of the input', () => {
    expect(windowEnd(['a', 'b'], 0)).toBe(2);
  });

  it('overlapLines is never less than one line', () => {
    expect(overlapLines(1)).toBe(1);
    expect(overlapLines(100)).toBe(15);
  });

  it('nextWindowStart always moves forward', () => {
    expect(nextWindowStart(0, 1)).toBe(1);
    expect(nextWindowStart(0, 100)).toBe(85);
    expect(nextWindowStart(10, 12)).toBe(11);
  });
});
