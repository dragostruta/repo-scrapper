import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

/** Thrown for anything the guardrails reject before a clone/walk is attempted. */
export class InvalidRepositorySourceError extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}

/** Thrown once a clone is in flight and turns out to exceed a size/file limit. */
export class RepositoryTooLargeError extends PayloadTooLargeException {
  constructor(message: string) {
    super(message);
  }
}
