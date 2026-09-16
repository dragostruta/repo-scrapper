import type { AskResponse, Citation, ConversationTurn } from '@app/shared';

export interface ChatMessage {
  id: string;
  question: string;
  answer?: string;
  citations?: Citation[];
  timings?: AskResponse['timings'];
  error?: string;
  pending: boolean;
}

/** How many prior turns ride along with each question, and how much of each
 * answer survives - follow-ups work without a long chat ballooning the
 * prompt (D7: cheap by default). */
export const HISTORY_TURNS = 4;
export const HISTORY_ANSWER_CHARS = 600;

export function truncateAnswer(answer: string, maxChars = HISTORY_ANSWER_CHARS): string {
  return answer.length > maxChars ? `${answer.slice(0, maxChars)}…` : answer;
}

/** The last few *answered* turns, oldest first - pending and failed ones are skipped. */
export function toHistory(messages: ChatMessage[]): ConversationTurn[] {
  return messages
    .filter((m): m is ChatMessage & { answer: string } => !m.pending && !!m.answer)
    .slice(-HISTORY_TURNS)
    .map((m) => ({ question: m.question, answer: truncateAnswer(m.answer) }));
}
