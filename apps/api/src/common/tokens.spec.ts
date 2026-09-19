import { estimateTokens } from './tokens';

describe('estimateTokens', () => {
  it.each([
    ['', 0],
    ['abc', 1],
    ['abcd', 2],
    ['x'.repeat(300), 100],
  ])('estimates %j as %i tokens', (text, tokens) => {
    expect(estimateTokens(text)).toBe(tokens);
  });

  it('never underestimates a real code sample, which is what would overflow the window', () => {
    const code = `export async function getUserById(userId: string): Promise<User | null> {\n  return this.prisma.user.findFirst({ where: { id: userId } });\n}\n`;
    // A GPT-style BPE tokenizer puts this sample in the mid-40s; the estimate
    // must sit at or above that, never below.
    expect(estimateTokens(code)).toBeGreaterThanOrEqual(45);
  });
});
