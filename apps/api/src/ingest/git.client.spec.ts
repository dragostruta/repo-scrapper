import { parseRemoteHeadSha } from './git.client';

describe('parseRemoteHeadSha', () => {
  const sha = '0123456789abcdef0123456789abcdef01234567';

  it('extracts the sha from ls-remote output', () => {
    expect(parseRemoteHeadSha(`${sha}\tHEAD\n`)).toBe(sha);
  });

  it('accepts upper-case hex', () => {
    expect(parseRemoteHeadSha(`${sha.toUpperCase()}\tHEAD`)).toBe(sha.toUpperCase());
  });

  it.each([
    ['empty output', ''],
    ['whitespace only', '  \n'],
    ['a short sha', 'abc123\tHEAD'],
    ['non-hex characters', `${'z'.repeat(40)}\tHEAD`],
    ['an error message', 'fatal: repository not found'],
  ])('returns null for %s', (_label, output) => {
    expect(parseRemoteHeadSha(output)).toBeNull();
  });
});
