import { estimateTokens } from './tokens';

describe('estimateTokens', () => {
  it.each([
    ['', 0],
    ['abcd', 1],
    ['abcde', 2],
    ['x'.repeat(400), 100],
  ])('estimates %j as %i tokens', (text, tokens) => {
    expect(estimateTokens(text)).toBe(tokens);
  });
});
