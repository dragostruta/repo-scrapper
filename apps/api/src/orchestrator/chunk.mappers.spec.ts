import { aRetrievedChunk } from '../../test/helpers/builders';
import { toChunkExcerpt, toCitation, toSearchHit } from './chunk.mappers';

describe('toCitation', () => {
  it('describes where the chunk is, without its content', () => {
    const citation = toCitation(aRetrievedChunk());
    expect(citation).toEqual({
      chunkId: 'chunk-1',
      path: 'src/auth.ts',
      startLine: 10,
      endLine: 20,
      symbol: 'login',
      language: 'typescript',
      score: 0.812,
    });
    expect(citation).not.toHaveProperty('content');
  });

  it.each([
    [0.81249, 0.812],
    [0.8125, 0.813],
    [1.15, 1.15],
    [0, 0],
  ])('rounds score %s to %s', (score, rounded) => {
    expect(toCitation(aRetrievedChunk({ score })).score).toBe(rounded);
  });
});

describe('toChunkExcerpt', () => {
  it('includes the code and its location', () => {
    expect(toChunkExcerpt(aRetrievedChunk())).toEqual({
      path: 'src/auth.ts',
      startLine: 10,
      endLine: 20,
      symbol: 'login',
      language: 'typescript',
      content: 'export function login() {}',
    });
  });
});

describe('toSearchHit', () => {
  it('is a citation that also carries the code', () => {
    const chunk = aRetrievedChunk();
    expect(toSearchHit(chunk)).toEqual({ ...toCitation(chunk), content: chunk.content });
  });
});
