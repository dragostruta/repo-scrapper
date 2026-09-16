import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownAnswer } from './markdown-answer';

describe('MarkdownAnswer', () => {
  it('renders markdown structure: emphasis, lists, inline code and tables', () => {
    const text = [
      'Login is **two steps**:',
      '',
      '1. hash the password',
      '2. compare with `storedHash`',
      '',
      '| file | role |',
      '| --- | --- |',
      '| auth.ts | login |',
    ].join('\n');
    const { container } = render(<MarkdownAnswer text={text} />);

    expect(screen.getByText('two steps').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('storedHash').tagName).toBe('CODE');
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('syntax-highlights fenced code blocks', () => {
    const { container } = render(<MarkdownAnswer text={'```ts\nconst answer = 42;\n```'} />);
    const code = container.querySelector('pre code');
    expect(code).toHaveClass('hljs');
    expect(code?.querySelector('.hljs-keyword')).toHaveTextContent('const');
  });

  it('does not render raw HTML from the model as elements', () => {
    const { container } = render(<MarkdownAnswer text={'<img src=x onerror="alert(1)"> hello'} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
