import { errorMessage } from './error-message';

describe('errorMessage', () => {
  it('uses an Error’s message', () => {
    expect(errorMessage(new TypeError('boom'))).toBe('boom');
  });

  it('returns a thrown string unchanged', () => {
    expect(errorMessage('plain failure')).toBe('plain failure');
  });

  it('serialises a plain object instead of printing [object Object]', () => {
    expect(errorMessage({ code: 42 })).toBe('{"code":42}');
  });

  it('survives values JSON cannot serialise', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(errorMessage(circular)).toBe('[object Object]');
    expect(errorMessage(undefined)).toBe('undefined');
    expect(errorMessage(10n)).toBe('10');
  });
});
