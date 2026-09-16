import type { ConversationTurn } from '@app/shared';

/**
 * The text actually embedded for a question. A short follow-up ("and where
 * is that called from?") has too little signal on its own, so the previous
 * *question* - never its answer - is prepended. Deliberately narrow: one turn
 * back, a lexical nudge rather than a query rewrite (see D9).
 */
export function buildRetrievalQuery(question: string, history: ConversationTurn[]): string {
  const previousQuestion = history.at(-1)?.question;
  return previousQuestion ? `${previousQuestion} ${question}` : question;
}
