/**
 * Errors the application raises on purpose, independent of any transport.
 *
 * Services throw these instead of Nest's HttpException subclasses so the
 * domain never knows it is being served over HTTP. The HTTP adapter maps
 * `kind` to a status code (see common/filters/error-response.ts); an MCP or
 * CLI adapter can map the same errors to its own error shape.
 */
export type DomainErrorKind =
  'invalid_input' | 'not_found' | 'conflict' | 'payload_too_large' | 'upstream_unavailable';

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** A repository URL the guardrails reject before any clone is attempted. */
export class InvalidRepositorySourceError extends DomainError {
  readonly kind = 'invalid_input';
}

/** The clone itself failed: the repository is missing, private, or timed out. */
export class RepositoryCloneError extends DomainError {
  readonly kind = 'invalid_input';
}

/** A clone or walk exceeded a size or file-count limit. */
export class RepositoryTooLargeError extends DomainError {
  readonly kind = 'payload_too_large';
}

export class RepositoryNotFoundError extends DomainError {
  readonly kind = 'not_found';

  constructor(repositoryId: string) {
    super(`Repository ${repositoryId} not found`);
  }
}

export class ChunkNotFoundError extends DomainError {
  readonly kind = 'not_found';

  constructor(chunkId: string) {
    super(`Chunk ${chunkId} not found in this repository`);
  }
}

/** Questions were asked about a repository that has not finished indexing. */
export class RepositoryNotReadyError extends DomainError {
  readonly kind = 'conflict';

  constructor(status: string) {
    super(`Repository is ${status.toLowerCase()}, not ready to answer questions yet.`);
  }
}

/** The LLM provider could not be reached or rejected the request. */
export class LlmUnavailableError extends DomainError {
  readonly kind = 'upstream_unavailable';
}
