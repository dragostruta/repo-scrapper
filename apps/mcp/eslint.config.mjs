// @ts-check
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        // Monorepo: without this, typescript-eslint's automatic tsconfig
        // discovery can walk up and find apps/api's tsconfig.json as an
        // equally valid candidate alongside this one, and refuses to guess
        // ("No tsconfigRootDir was set, and multiple candidate
        // TSConfigRootDirs are present"). Anchoring it here (an editor's
        // ESLint extension hits this; the CLI's cwd already made it
        // unambiguous) removes the ambiguity.
        tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // stdout is the MCP protocol channel - diagnostics must go to stderr (console.error).
      'no-console': ['error', { allow: ['error'] }],
    },
  },
  prettierConfig,
);
