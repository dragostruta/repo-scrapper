import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { aRepository } from '@/test/builders';
import { IndexingStatus } from './indexing-status';

describe('IndexingStatus', () => {
  it.each([
    ['PENDING', 'Queued'],
    ['CLONING', 'Cloning repository'],
    ['INDEXING', 'Chunking and embedding'],
  ] as const)('shows progress while %s', (status, label) => {
    render(<IndexingStatus repository={aRepository({ status })} />);
    expect(screen.getByText(`acme/widgets · ${label}`)).toBeInTheDocument();
  });

  it('shows the counts once ready', () => {
    render(<IndexingStatus repository={aRepository({ status: 'INDEXED' })} />);
    expect(screen.getByText('acme/widgets · Ready · 12 chunks across 3 files')).toBeInTheDocument();
  });

  it('shows the failure reason as an alert', () => {
    render(
      <IndexingStatus
        repository={aRepository({ status: 'FAILED', error: 'Could not clone acme/widgets.' })}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Could not clone acme/widgets.');
  });

  it('shows a default failure message when there is no reason', () => {
    render(<IndexingStatus repository={aRepository({ status: 'FAILED', error: null })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Indexing failed.');
  });
});
