import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { aRepository } from '@/test/builders';
import { RepoIntake } from './repo-intake';

describe('RepoIntake', () => {
  beforeEach(() => {
    vi.spyOn(api, 'listRepositories').mockResolvedValue([]);
    vi.spyOn(api, 'createRepository');
    vi.spyOn(api, 'getRepository');
  });

  it('indexes a submitted URL and hands over an already-indexed result', async () => {
    const indexed = aRepository({ status: 'INDEXED' });
    vi.mocked(api.createRepository).mockResolvedValue(indexed);
    const onIndexed = vi.fn();
    render(<RepoIntake onIndexed={onIndexed} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Repository URL' }),
      'https://github.com/acme/widgets',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Index' }));

    expect(api.createRepository).toHaveBeenCalledWith('https://github.com/acme/widgets');
    expect(onIndexed).toHaveBeenCalledWith(indexed);
  });

  it('locks the form and shows progress while indexing', async () => {
    vi.mocked(api.createRepository).mockResolvedValue(aRepository({ status: 'CLONING' }));
    render(<RepoIntake onIndexed={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox'), 'https://github.com/acme/widgets{Enter}');

    expect(await screen.findByText('acme/widgets · Cloning repository')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Index' })).toBeDisabled();
  });

  it('shows why a URL was rejected and keeps the form usable', async () => {
    vi.mocked(api.createRepository).mockRejectedValue(
      new api.ApiError('"gitlab.com" is not an allowed repository host.', 400),
    );
    render(<RepoIntake onIndexed={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox'), 'https://gitlab.com/a/b{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '"gitlab.com" is not an allowed repository host.',
    );
    expect(screen.getByRole('textbox')).toBeEnabled();
  });

  it('explains when the API cannot be reached', async () => {
    vi.mocked(api.createRepository).mockRejectedValue(new TypeError('Failed to fetch'));
    render(<RepoIntake onIndexed={vi.fn()} />);

    await userEvent.type(screen.getByRole('textbox'), 'https://github.com/acme/widgets{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the API.');
  });

  it('does nothing for an empty URL', async () => {
    render(<RepoIntake onIndexed={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Index' }));
    expect(api.createRepository).not.toHaveBeenCalled();
  });

  it('lists already-indexed repositories and opens one without re-indexing', async () => {
    const existing = aRepository({ id: 'r7', name: 'nestjs/nest', revision: '1234567890' });
    vi.mocked(api.listRepositories).mockResolvedValue([existing]);
    const onIndexed = vi.fn();
    render(<RepoIntake onIndexed={onIndexed} />);

    await userEvent.click(await screen.findByRole('button', { name: /nestjs\/nest/ }));

    expect(onIndexed).toHaveBeenCalledWith(existing);
    expect(api.createRepository).not.toHaveBeenCalled();
  });

  it('shows the resumed repository’s status instead of the list', async () => {
    vi.mocked(api.listRepositories).mockResolvedValue([aRepository({ name: 'other/repo' })]);
    render(
      <RepoIntake
        onIndexed={vi.fn()}
        resume={aRepository({
          status: 'FAILED',
          error: 'Indexing was interrupted by a server restart.',
        })}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Indexing was interrupted by a server restart.',
    );
    expect(screen.queryByText('Already indexed')).not.toBeInTheDocument();
  });
});
