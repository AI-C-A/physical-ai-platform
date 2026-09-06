import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { fsdBoundariesPlugin } from './eslint-rules/fsd-boundaries.js';

export default defineConfig(
  globalIgnores([
    'dist',
    'coverage',
    '.venv',
    'node_modules',
    'playwright-report',
    'test-results',
    'artifacts',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      fsd: fsdBoundariesPlugin,
    },
    rules: {
      'fsd/boundaries': 'error',
      'fsd/ui-adapter-isolation': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'TypeScript enum 대신 const object 또는 string union을 사용하세요.',
        },
        {
          selector: 'ExportDefaultDeclaration',
          message: '애플리케이션 코드는 named export만 사용하세요.',
        },
      ],
    },
  },
  {
    files: ['vite.config.ts', 'playwright.config.ts', 'playwright.soak.config.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['src/app/router/app-routes.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['gateway/**/*.mjs', 'scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/shared/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@base-ui-components/**',
                '@chakra-ui/**',
                '@google/model-viewer',
                '@headlessui/**',
                '@mui/**',
                '@radix-ui/**',
                '@react-aria/**',
                'class-variance-authority',
                'clsx',
                'antd',
                'antd/**',
                'lucide-react',
                'radix-ui',
                'radix-ui/**',
                'recharts',
                'recharts/**',
                'react-aria-components',
                'tailwind-merge',
              ],
              message:
                'UI 라이브러리는 shared/ui에서 소유한 Public API를 통해 사용하세요.',
            },
          ],
        },
      ],
    },
  },
);
