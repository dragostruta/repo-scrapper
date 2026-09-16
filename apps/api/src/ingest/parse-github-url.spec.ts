import { InvalidRepositorySourceError } from '../common/errors/domain-errors';
import { parseGithubUrl } from './parse-github-url';

const HOSTS = ['github.com'];

describe('parseGithubUrl', () => {
  it.each([
    ['https://github.com/nestjs/nest', 'nestjs/nest'],
    ['https://github.com/nestjs/nest.git', 'nestjs/nest'],
    ['https://github.com/nestjs/nest/', 'nestjs/nest'],
    ['https://github.com/nestjs/nest/tree/main', 'nestjs/nest'],
    ['  https://github.com/nestjs/nest  ', 'nestjs/nest'],
    ['https://github.com/nestjs/nest?tab=readme#top', 'nestjs/nest'],
    ['https://github.com/my-org.io/repo_name.js', 'my-org.io/repo_name.js'],
  ])('accepts %j', (input, expectedName) => {
    const result = parseGithubUrl(input, HOSTS);
    expect(result).toEqual({
      name: expectedName,
      cloneUrl: `https://github.com/${expectedName}.git`,
      host: 'github.com',
    });
  });

  it('is case-insensitive on the host', () => {
    expect(parseGithubUrl('https://GitHub.com/nestjs/nest', HOSTS).name).toBe('nestjs/nest');
  });

  it.each([
    'http://github.com/nestjs/nest',
    'git@github.com:nestjs/nest.git',
    'ssh://github.com/a/b',
  ])('rejects non-https URL %j', (input) => {
    expect(() => parseGithubUrl(input, HOSTS)).toThrow(InvalidRepositorySourceError);
  });

  it('rejects hosts outside the allowlist and names the allowed ones', () => {
    expect(() => parseGithubUrl('https://gitlab.com/nestjs/nest', HOSTS)).toThrow(
      /"gitlab.com" is not an allowed repository host. Allowed: github.com/,
    );
  });

  it('rejects look-alike hosts', () => {
    expect(() => parseGithubUrl('https://github.com.evil.io/a/b', HOSTS)).toThrow(
      /not an allowed repository host/,
    );
  });

  it.each(['https://github.com/', 'https://github.com/only-owner'])(
    'rejects %j with no owner/repo pair',
    (input) => {
      expect(() => parseGithubUrl(input, HOSTS)).toThrow(/Expected a repository URL/);
    },
  );

  it('rejects owner/repo segments with unexpected characters', () => {
    expect(() => parseGithubUrl('https://github.com/own%20er/repo', HOSTS)).toThrow(
      /unexpected characters/,
    );
  });

  it('rejects garbage input', () => {
    expect(() => parseGithubUrl('not a url', HOSTS)).toThrow(/is not a valid URL/);
    expect(() => parseGithubUrl('', HOSTS)).toThrow(InvalidRepositorySourceError);
  });

  it('rejects everything when the allowlist is empty', () => {
    expect(() => parseGithubUrl('https://github.com/a/b', [])).toThrow(/not an allowed/);
  });
});
