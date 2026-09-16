import { buildSystemPrompt, buildUserMessage } from './prompt';

describe('buildSystemPrompt', () => {
  it('instructs the model to treat context as untrusted data, not instructions', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/untrusted/i);
    expect(prompt).toMatch(/<context>/);
  });

  it('instructs the model to decline questions outside the codebase', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toMatch(/only answer questions about this codebase/i);
  });
});

describe('buildUserMessage', () => {
  it('wraps context in a labelled <context> block', () => {
    const message = buildUserMessage('How does X work?', 'function x() {}');
    expect(message).toContain('<context>');
    expect(message).toContain('</context>');
    expect(message).toContain('function x() {}');
    // The delimiters must actually bound the untrusted text, not just appear
    // somewhere in the message.
    const opens = message.indexOf('<context>');
    const closes = message.indexOf('</context>');
    const content = message.indexOf('function x() {}');
    expect(content).toBeGreaterThan(opens);
    expect(content).toBeLessThan(closes);
  });

  it('does not add an empty context block when nothing was retrieved', () => {
    const message = buildUserMessage('How does X work?', '   ');
    expect(message).not.toContain('<context>');
    expect(message).toContain('No relevant context was found');
  });
});
