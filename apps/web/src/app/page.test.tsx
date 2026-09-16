import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_REPOSITORY_KEY } from '@/hooks/use-active-repository';
import * as api from '@/lib/api';
import { aRepository } from '@/test/builders';
import Home from './page';

describe('Home page', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listRepositories').mockResolvedValue([aRepository({ name: 'acme/widgets' })]);
    vi.spyOn(api, 'getRepository');
  });

  it('starts on the intake screen for a first visit', async () => {
    render(<Home />);
    expect(
      await screen.findByRole('heading', { name: 'Code Documentation Assistant' }),
    ).toBeInTheDocument();
  });

  it('goes to chat after picking a repository, and back on switch', async () => {
    render(<Home />);

    await userEvent.click(await screen.findByRole('button', { name: /acme\/widgets/ }));
    expect(await screen.findByRole('button', { name: 'Switch repository' })).toBeInTheDocument();
    expect(window.localStorage.getItem(ACTIVE_REPOSITORY_KEY)).toBe('repo-1');

    await userEvent.click(screen.getByRole('button', { name: 'Switch repository' }));
    expect(
      await screen.findByRole('heading', { name: 'Code Documentation Assistant' }),
    ).toBeInTheDocument();
  });

  it('reopens the remembered repository straight into chat', async () => {
    window.localStorage.setItem(ACTIVE_REPOSITORY_KEY, 'repo-1');
    vi.mocked(api.getRepository).mockResolvedValue(aRepository());

    render(<Home />);

    expect(await screen.findByRole('button', { name: 'Switch repository' })).toBeInTheDocument();
  });
});
