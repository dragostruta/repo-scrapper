/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: '<rootDir>/test/jest-node-env.js',
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/**/__fixtures__/**',
  ],
  // Loading a local embedding model and parsing a fixture repo is slower than
  // a unit test, but still fast enough to keep in the default suite.
  testTimeout: 120000,
};
