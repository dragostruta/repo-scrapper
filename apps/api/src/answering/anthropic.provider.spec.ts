import { ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { mapAnthropicError } from './anthropic.provider';

describe('mapAnthropicError', () => {
  it('gives an actionable message for a bad/missing API key', () => {
    const err = new Anthropic.AuthenticationError(
      401,
      { message: 'invalid x-api-key' },
      'invalid x-api-key',
      new Headers(),
    );
    const mapped = mapAnthropicError(err);
    expect(mapped).toBeInstanceOf(ServiceUnavailableException);
    expect(mapped.message).toMatch(/API key/i);
    expect(mapped.message).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('gives an actionable message for a rate limit', () => {
    const err = new Anthropic.RateLimitError(
      429,
      { message: 'rate limited' },
      'rate limited',
      new Headers(),
    );
    const mapped = mapAnthropicError(err);
    expect(mapped.message).toMatch(/rate.limit/i);
  });

  it('gives an actionable message for a connection failure', () => {
    const err = new Anthropic.APIConnectionError({ message: 'fetch failed' });
    const mapped = mapAnthropicError(err);
    expect(mapped.message).toMatch(/could not reach/i);
  });

  it('falls back to a readable message for an unrecognised error', () => {
    const mapped = mapAnthropicError(new Error('something else broke'));
    expect(mapped.message).toContain('something else broke');
  });

  it('never lets a non-Error value produce "[object Object]"', () => {
    const mapped = mapAnthropicError({ weird: 'shape' });
    expect(mapped.message).not.toContain('[object Object]');
  });
});
