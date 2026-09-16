import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { aCitation } from '@/test/builders';
import { CitationChip, citationLabel } from './citation-chip';

describe('citationLabel', () => {
  it('shows path, lines and symbol', () => {
    expect(citationLabel(aCitation())).toBe('src/auth.ts:10-20 (login)');
  });

  it('omits a missing symbol', () => {
    expect(citationLabel(aCitation({ symbol: null }))).toBe('src/auth.ts:10-20');
  });
});

describe('CitationChip', () => {
  it('expands to show the cited code, and collapses again', async () => {
    vi.spyOn(api, 'getChunkExcerpt').mockResolvedValue({
      path: 'src/auth.ts',
      startLine: 10,
      endLine: 20,
      symbol: 'login',
      language: 'typescript',
      content: 'export function login() { return hash(pw); }',
    });
    render(<CitationChip repositoryId="repo-1" citation={aCitation()} />);
    const chip = screen.getByRole('button', { name: 'src/auth.ts:10-20 (login)' });
    expect(chip).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(chip);

    expect(await screen.findByText(/return hash\(pw\)/)).toBeInTheDocument();
    expect(chip).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(chip);
    expect(screen.queryByText(/return hash\(pw\)/)).not.toBeInTheDocument();
  });

  it('shows why the code could not be loaded', async () => {
    vi.spyOn(api, 'getChunkExcerpt').mockRejectedValue(
      new api.ApiError('Chunk c1 not found in this repository', 404),
    );
    render(<CitationChip repositoryId="repo-1" citation={aCitation()} />);

    await userEvent.click(screen.getByRole('button'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Chunk c1 not found in this repository',
    );
  });
});
