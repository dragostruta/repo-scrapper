import { parseGithubUrl } from './parse-github-url';
import { InvalidRepositorySourceError } from './ingest.errors';

const HOSTS = ['github.com'];

describe('parseGithubUrl', () => {
  it.each([
    ['https://github.com/nestjs/nest', 'nestjs/nest'],
    ['https://github.com/nestjs/nest.git', 'nestjs/nest'],
    ['https://github.com/nestjs/nest/', 'nestjs/nest'],
    ['https://github.com/nestjs/nest/tree/main', 'nestjs/nest'],
  ])('accepts %s', (input, expectedName) => {
    const result = parseGithubUrl(input, HOSTS);
    expect(result.name).toBe(expectedName);
    expect(result.cloneUrl).toBe(`https://github.com/${expectedName}.git`);
  });

  it('rejects non-https URLs', () => {
    expect(() => parseGithubUrl('http://github.com/nestjs/nest', HOSTS)).toThrow(
      InvalidRepositorySourceError,
    );
    expect(() => parseGithubUrl('git@github.com:nestjs/nest.git', HOSTS)).toThrow(
      InvalidRepositorySourceError,
    );
  });

  it('rejects hosts outside the allowlist', () => {
    expect(() => parseGithubUrl('https://gitlab.com/nestjs/nest', HOSTS)).toThrow(
      /not an allowed repository host/,
    );
  });

  it('rejects a bare host with no owner/repo', () => {
    expect(() => parseGithubUrl('https://github.com/', HOSTS)).toThrow(InvalidRepositorySourceError);
  });

  it('rejects garbage input', () => {
    expect(() => parseGithubUrl('not a url', HOSTS)).toThrow(InvalidRepositorySourceError);
  });

  it('is case-insensitive on the host', () => {
    expect(parseGithubUrl('https://GitHub.com/nestjs/nest', HOSTS).name).toBe('nestjs/nest');
  });
});
