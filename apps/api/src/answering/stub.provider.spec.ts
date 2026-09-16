import { STUB_NOT_FOUND_ANSWER, StubLlmProvider } from './stub.provider';

describe('StubLlmProvider', () => {
  const provider = new StubLlmProvider();

  it('answers "not found" when retrieval found nothing, like the real grounding rule', async () => {
    expect(await provider.answer({ question: 'q', contextText: '' })).toBe(STUB_NOT_FOUND_ANSWER);
    expect(await provider.answer({ question: 'q', contextText: '   \n' })).toBe(
      STUB_NOT_FOUND_ANSWER,
    );
  });

  it('answers deterministically when there is context', async () => {
    const answer = await provider.answer({ question: 'How does login work?', contextText: 'code' });
    expect(answer).toBe(
      '[stub answer] Based on the provided context, here is a response to: "How does login work?"',
    );
  });
});
