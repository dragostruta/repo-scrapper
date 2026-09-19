import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuestionForm } from './question-form';

describe('QuestionForm', () => {
  it('submits the question and clears the input', async () => {
    const onAsk = vi.fn();
    render(<QuestionForm onAsk={onAsk} disabled={false} />);
    const input = screen.getByRole('textbox', { name: 'Question' });

    await userEvent.type(input, 'How does login work?{Enter}');

    expect(onAsk).toHaveBeenCalledWith('How does login work?');
    expect(input).toHaveValue('');
  });

  it('cannot submit an empty or whitespace-only question', async () => {
    const onAsk = vi.fn();
    render(<QuestionForm onAsk={onAsk} disabled={false} />);
    const button = screen.getByRole('button', { name: /^Ask/ });

    expect(button).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox'), '   {Enter}');
    expect(button).toBeDisabled();
    expect(onAsk).not.toHaveBeenCalled();
  });

  it('keeps the typed question but blocks submitting while disabled', async () => {
    const onAsk = vi.fn();
    render(<QuestionForm onAsk={onAsk} disabled />);

    await userEvent.type(screen.getByRole('textbox'), 'next question{Enter}');

    expect(onAsk).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('next question');
    expect(screen.getByRole('button', { name: /^Ask/ })).toBeDisabled();
  });
});
