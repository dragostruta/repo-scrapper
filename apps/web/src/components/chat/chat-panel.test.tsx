import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { aRepository, anAskResponse, deferred } from '@/test/builders';
import { ChatPanel } from './chat-panel';
import { STARTER_QUESTIONS } from './starter-questions';

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.spyOn(api, 'askRepository').mockResolvedValue(anAskResponse());
  });

  const renderPanel = (onSwitchRepo = vi.fn()) =>
    render(
      <ChatPanel
        repo={aRepository({ revision: 'abcdef1234567890' })}
        onSwitchRepo={onSwitchRepo}
      />,
    );

  it('shows the repository summary', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'acme/widgets' })).toBeInTheDocument();
    expect(screen.getByText(/12 chunks · 3 files · abcdef1/)).toBeInTheDocument();
  });

  it('offers starter questions on an empty chat, and asks one on click', async () => {
    renderPanel();
    for (const question of STARTER_QUESTIONS) {
      expect(screen.getByRole('button', { name: question })).toBeInTheDocument();
    }

    await userEvent.click(screen.getByRole('button', { name: 'What does this project do?' }));

    expect(api.askRepository).toHaveBeenCalledWith('repo-1', 'What does this project do?', []);
    expect(await screen.findByText('src/auth.ts')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: STARTER_QUESTIONS[1] })).not.toBeInTheDocument();
  });

  it('shows a thinking state, then the rendered answer with citations and timings', async () => {
    const request = deferred<ReturnType<typeof anAskResponse>>();
    vi.mocked(api.askRepository).mockReturnValue(request.promise);
    renderPanel();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Question' }),
      'How does login work?{Enter}',
    );

    expect(screen.getByText('How does login work?')).toBeInTheDocument();
    expect(screen.getByText(/Thinking/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled();

    request.resolve(anAskResponse());

    const answer = await screen.findByRole('article');
    expect(within(answer).getByText('src/auth.ts').tagName).toBe('CODE');
    expect(
      within(answer).getByRole('button', { name: 'src/auth.ts:10-20 (login)' }),
    ).toBeInTheDocument();
    expect(within(answer).getByText(/320ms total/)).toBeInTheDocument();
    expect(screen.queryByText(/Thinking/)).not.toBeInTheDocument();
  });

  it('shows the error for a failed question and lets the user ask again', async () => {
    vi.mocked(api.askRepository).mockRejectedValueOnce(
      new api.ApiError('Anthropic rate-limited this request.', 503),
    );
    renderPanel();

    await userEvent.type(screen.getByRole('textbox'), 'q1{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Anthropic rate-limited this request.',
    );
    await userEvent.type(screen.getByRole('textbox'), 'q2{Enter}');
    expect(api.askRepository).toHaveBeenCalledTimes(2);
  });

  it('switches repository on request', async () => {
    const onSwitchRepo = vi.fn();
    renderPanel(onSwitchRepo);
    await userEvent.click(screen.getByRole('button', { name: 'Switch repository' }));
    expect(onSwitchRepo).toHaveBeenCalled();
  });
});
