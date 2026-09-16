import { describe, expect, it } from 'vitest';
import { isTerminal, shortRevision, STATUS_LABEL } from './repository-status';

describe('repository status helpers', () => {
  it.each([
    ['INDEXED', true],
    ['FAILED', true],
    ['PENDING', false],
    ['CLONING', false],
    ['INDEXING', false],
  ] as const)('isTerminal(%s) is %s', (status, terminal) => {
    expect(isTerminal(status)).toBe(terminal);
  });

  it('labels every status', () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([
      'CLONING',
      'FAILED',
      'INDEXED',
      'INDEXING',
      'PENDING',
    ]);
  });

  it('shortens a sha to 7 characters and leaves short values alone', () => {
    expect(shortRevision('abcdef1234567890')).toBe('abcdef1');
    expect(shortRevision('pending')).toBe('pending');
  });
});
