import { toVectorLiteral } from './vector-literal';

describe('toVectorLiteral', () => {
  it('formats a pgvector text literal', () => {
    expect(toVectorLiteral([0.1, -2, 3e-7])).toBe('[0.1,-2,3e-7]');
  });

  it('formats an empty vector', () => {
    expect(toVectorLiteral([])).toBe('[]');
  });

  it.each([NaN, Infinity, -Infinity])(
    'refuses %s so nothing unexpected reaches the SQL',
    (value) => {
      expect(() => toVectorLiteral([1, value])).toThrow(/non-finite/);
    },
  );
});
