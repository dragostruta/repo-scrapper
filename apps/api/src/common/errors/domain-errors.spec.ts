import {
  ChunkNotFoundError,
  DomainError,
  InvalidRepositorySourceError,
  LlmUnavailableError,
  RepositoryCloneError,
  RepositoryNotFoundError,
  RepositoryNotReadyError,
  RepositoryTooLargeError,
} from './domain-errors';

describe('domain errors', () => {
  it.each([
    [new InvalidRepositorySourceError('bad url'), 'invalid_input'],
    [new RepositoryCloneError('no clone'), 'invalid_input'],
    [new RepositoryTooLargeError('too big'), 'payload_too_large'],
    [new RepositoryNotFoundError('r1'), 'not_found'],
    [new ChunkNotFoundError('c1'), 'not_found'],
    [new RepositoryNotReadyError('INDEXING'), 'conflict'],
    [new LlmUnavailableError('down'), 'upstream_unavailable'],
  ])('%s has kind %s', (error, kind) => {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe(kind);
  });

  it('names each error after its class, so logs show what failed', () => {
    expect(new RepositoryNotFoundError('r1').name).toBe('RepositoryNotFoundError');
  });

  it('builds readable messages from ids and statuses', () => {
    expect(new RepositoryNotFoundError('r1').message).toBe('Repository r1 not found');
    expect(new ChunkNotFoundError('c9').message).toContain('c9');
    expect(new RepositoryNotReadyError('CLONING').message).toBe(
      'Repository is cloning, not ready to answer questions yet.',
    );
  });
});
