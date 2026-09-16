import { describe, expect, it } from 'vitest';
import {
  type ChatMessage,
  HISTORY_ANSWER_CHARS,
  HISTORY_TURNS,
  toHistory,
  truncateAnswer,
} from './chat-history';

const answered = (i: number, answer = `answer ${i}`): ChatMessage => ({
  id: `m${i}`,
  question: `question ${i}`,
  answer,
  pending: false,
});

describe('toHistory', () => {
  it('is empty for a new chat', () => {
    expect(toHistory([])).toEqual([]);
  });

  it('keeps answered turns in order, as question/answer pairs', () => {
    expect(toHistory([answered(1), answered(2)])).toEqual([
      { question: 'question 1', answer: 'answer 1' },
      { question: 'question 2', answer: 'answer 2' },
    ]);
  });

  it('skips pending and failed turns', () => {
    const messages: ChatMessage[] = [
      answered(1),
      { id: 'p', question: 'still thinking', pending: true },
      { id: 'f', question: 'broke', error: 'Request failed.', pending: false },
    ];
    expect(toHistory(messages).map((t) => t.question)).toEqual(['question 1']);
  });

  it(`keeps only the last ${HISTORY_TURNS} turns`, () => {
    const messages = Array.from({ length: 7 }, (_, i) => answered(i));
    expect(toHistory(messages).map((t) => t.question)).toEqual([
      'question 3',
      'question 4',
      'question 5',
      'question 6',
    ]);
  });

  it('truncates long answers', () => {
    const [turn] = toHistory([answered(1, 'x'.repeat(HISTORY_ANSWER_CHARS + 50))]);
    expect(turn.answer).toHaveLength(HISTORY_ANSWER_CHARS + 1);
    expect(turn.answer.endsWith('…')).toBe(true);
  });
});

describe('truncateAnswer', () => {
  it('leaves an answer at the limit untouched', () => {
    expect(truncateAnswer('abc', 3)).toBe('abc');
    expect(truncateAnswer('abcd', 3)).toBe('abc…');
  });
});
