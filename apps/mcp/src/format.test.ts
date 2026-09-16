import { describe, expect, it } from 'vitest';
import {
  codeFence,
  formatAnswer,
  formatExcerpt,
  formatRepository,
  formatRepositoryList,
  formatSearchResults,
  location,
} from './format.js';
import { aRepository, aSearchHit, anAskResponse } from './test/builders.js';

describe('codeFence', () => {
  it('wraps code with a language tag', () => {
    expect(codeFence('const a = 1;', 'typescript')).toBe('```typescript\nconst a = 1;\n```');
  });

  it('uses a longer fence than any backtick run inside the code', () => {
    const markdown = 'Example:\n```js\nx()\n```\nand `inline`';
    const fenced = codeFence(markdown, 'markdown');
    expect(fenced.startsWith('````markdown\n')).toBe(true);
    expect(fenced.endsWith('\n````')).toBe(true);
  });

  it('works without a language', () => {
    expect(codeFence('plain')).toBe('```\nplain\n```');
  });
});

describe('location', () => {
  it('includes the symbol only when present', () => {
    expect(location(aSearchHit())).toBe('src/auth.ts:10-20 (login)');
    expect(location(aSearchHit({ symbol: null }))).toBe('src/auth.ts:10-20');
  });
});

describe('formatRepository', () => {
  it('summarises an indexed repository', () => {
    expect(formatRepository(aRepository())).toBe(
      'acme/widgets [INDEXED] id=repo-1 - 3 files, 12 chunks, commit abcdef1',
    );
  });

  it('includes the failure reason', () => {
    expect(
      formatRepository(aRepository({ status: 'FAILED', error: 'Could not clone.' })),
    ).toContain('Could not clone.');
    expect(formatRepository(aRepository({ status: 'FAILED', error: null }))).toContain(
      'indexing failed',
    );
  });

  it('shows just the status while in progress', () => {
    expect(formatRepository(aRepository({ status: 'CLONING' }))).toBe(
      'acme/widgets [CLONING] id=repo-1',
    );
  });
});

describe('formatRepositoryList', () => {
  it('guides the model when nothing is indexed', () => {
    expect(formatRepositoryList([])).toMatch(/No repositories.*index_repository/);
  });

  it('counts ready repositories and lists each one', () => {
    const text = formatRepositoryList([
      aRepository(),
      aRepository({ id: 'r2', status: 'INDEXING' }),
    ]);
    expect(text.split('\n')[0]).toBe('2 repositories (1 ready to query):');
    expect(text).toContain('- acme/widgets [INDEXING] id=r2');
  });
});

describe('formatAnswer', () => {
  it('shows the answer followed by numbered sources with chunk ids', () => {
    const text = formatAnswer(aRepository(), anAskResponse());
    expect(text).toContain('Login hashes the password.');
    expect(text).toContain('[1] src/auth.ts:10-20 (login) chunk=chunk-1 score=0.81');
  });

  it('says plainly when nothing was retrieved', () => {
    expect(formatAnswer(aRepository(), anAskResponse({ citations: [] }))).toContain(
      'No source code was retrieved',
    );
  });
});

describe('formatSearchResults', () => {
  it('numbers hits and includes each one’s code', () => {
    const text = formatSearchResults(aRepository(), 'login', {
      results: [
        aSearchHit(),
        aSearchHit({ chunkId: 'chunk-2', path: 'src/session.ts', content: 'validate()' }),
      ],
      timings: { embedQuestion: 1, retrieve: 1 },
    });
    expect(text).toContain('2 code chunks from acme/widgets for "login"');
    expect(text).toContain('## [1] src/auth.ts:10-20 (login) - score 0.81, chunk chunk-1');
    expect(text).toContain('```typescript\nexport function login() {}\n```');
    expect(text.indexOf('[1]')).toBeLessThan(text.indexOf('[2]'));
  });

  it('says when nothing matched', () => {
    expect(
      formatSearchResults(aRepository(), 'quantum', {
        results: [],
        timings: { embedQuestion: 1, retrieve: 1 },
      }),
    ).toBe('No code in acme/widgets matched "quantum".');
  });
});

describe('formatExcerpt', () => {
  it('shows where the code is and the code itself', () => {
    const { chunkId: _c, score: _s, ...excerpt } = aSearchHit();
    expect(formatExcerpt(aRepository(), excerpt)).toBe(
      'acme/widgets - src/auth.ts:10-20 (login)\n```typescript\nexport function login() {}\n```',
    );
  });
});
