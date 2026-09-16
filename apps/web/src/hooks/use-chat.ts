'use client';

import { useCallback, useRef, useState } from 'react';
import { askRepository, describeError } from '@/lib/api';
import { type ChatMessage, toHistory } from '@/lib/chat-history';

export interface ChatState {
  messages: ChatMessage[];
  /** A question is waiting for its answer. */
  pending: boolean;
  ask: (question: string) => Promise<void>;
}

export function useChat(repositoryId: string): ChatState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Mirrors `messages` synchronously so history and the pending guard are
  // correct even when ask() is called twice before a re-render.
  const messagesRef = useRef<ChatMessage[]>([]);

  const update = useCallback((next: (prev: ChatMessage[]) => ChatMessage[]) => {
    messagesRef.current = next(messagesRef.current);
    setMessages(messagesRef.current);
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<ChatMessage>) =>
      update((prev) => prev.map((m) => (m.id === id ? { ...m, ...changes } : m))),
    [update],
  );

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || messagesRef.current.some((m) => m.pending)) return;

      const id = crypto.randomUUID();
      const history = toHistory(messagesRef.current);
      update((prev) => [...prev, { id, question, pending: true }]);

      try {
        const { answer, citations, timings } = await askRepository(repositoryId, question, history);
        patch(id, { pending: false, answer, citations, timings });
      } catch (err) {
        patch(id, { pending: false, error: describeError(err, 'Request failed.') });
      }
    },
    [repositoryId, update, patch],
  );

  return { messages, pending: messages.some((m) => m.pending), ask };
}
