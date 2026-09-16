/** Generic enough to make sense for almost any repository. */
export const STARTER_QUESTIONS = [
  'What does this project do?',
  'What are the main dependencies?',
  'Where is the entry point / main function?',
  'What are the API endpoints, if any?',
];

export function StarterQuestions({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-ink-muted)]">
        Ask how something works, where a piece of functionality lives, or what an endpoint does.
        Answers are grounded in this repository only.
      </p>
      <div className="flex flex-wrap gap-2">
        {STARTER_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => onPick(question)}
            className="rounded-full border border-[var(--color-border-subtle)] px-3 py-1.5 text-xs text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  );
}
