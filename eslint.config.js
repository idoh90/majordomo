// Import-boundary guard only — no style rules. Build stays `tsc --noEmit && vite build`.
// Zones: core/ knows nothing about modules/ or app/; console modules must not
// import each other. Regex (not glob) patterns because all project imports are
// relative and glob matching of `../` specifiers is unreliable. Note the core
// rule does not check dynamic import(); the only dynamic imports (training
// store DEV block) are within-module, so no gap in practice.
import tsParser from '@typescript-eslint/parser'

export default [
  { ignores: ['dist/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(\\.\\./)+(modules|app)(/|$)',
              message:
                'core/ must not import from modules/ or app/ — core is extracted on contact, never designed up front.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/training/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(\\.\\./)+(modules/)?capital(/|$)',
              message: 'consoles must not import each other (training → capital).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/capital/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(\\.\\./)+(modules/)?training(/|$)',
              message: 'consoles must not import each other (capital → training).',
            },
          ],
        },
      ],
    },
  },
]
