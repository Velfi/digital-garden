import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier/flat';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/.DS_Store',
      '**/node_modules/**',
      'build/**',
      'coverage/**',
      '.vercel/**',
      '.svelte-kit/**',
      'eslint.config.js',
      'package/**',
      '**/.env',
      '**/.env.*',
      'amplify/**',
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      'svelte.config.js',
      '**/*.cjs'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        ecmaVersion: 2020,
        project: './tsconfig.json',
        extraFileExtensions: ['.svelte'],
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: ['**/*.svelte', '*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tsparser
      }
    }
  },
  prettier
];
