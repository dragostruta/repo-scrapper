// @ts-check
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'src/generated/**',
      'src/**/__fixtures__/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        // Monorepo: without this, typescript-eslint's automatic tsconfig
        // discovery can walk up and find apps/mcp's tsconfig.json as an
        // equally valid candidate alongside this one, and refuses to guess
        // ("No tsconfigRootDir was set, and multiple candidate
        // TSConfigRootDirs are present"). Anchoring it here (an editor's
        // ESLint extension hits this; the CLI's cwd already made it
        // unambiguous) removes the ambiguity.
        tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
      },
    },
    rules: {
      // Nest constructors legitimately carry decorators with empty bodies.
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Last: turns off any stylistic rule that would otherwise fight Prettier.
  prettierConfig,
);
