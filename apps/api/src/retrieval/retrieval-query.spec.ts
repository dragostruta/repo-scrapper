import { buildRetrievalQuery } from './retrieval-query';

describe('buildRetrievalQuery', () => {
  it('uses the question alone at the start of a chat', () => {
    expect(buildRetrievalQuery('How does login work?', [])).toBe('How does login work?');
  });

  it('prepends only the most recent previous question', () => {
    const history = [
      { question: 'first question', answer: 'first answer' },
      { question: 'How does login work?', answer: 'It calls validatePassword.' },
    ];
    expect(buildRetrievalQuery('and where is that called?', history)).toBe(
      'How does login work? and where is that called?',
    );
  });

  it('never folds answer text into the query', () => {
    const history = [{ question: 'q', answer: 'LONG ANSWER TEXT' }];
    expect(buildRetrievalQuery('follow up', history)).not.toContain('ANSWER');
  });
});
