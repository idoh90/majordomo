// Import-boundary guard only — no style rules. Build stays `tsc --noEmit && vite build`.
// Zones: core/ knows nothing about modules/ or app/; console modules must not
// import each other. Regex (not glob) patterns because all project imports are
// relative and glob matching of `../` specifiers is unreliable. Note the core
// rule does not check dynamic import(); the only dynamic imports (training
// store DEV block, the founder asset bundle) are within-zone, so no gap in
// practice.
import tsParser from '@typescript-eslint/parser'

const wingRule = (self, others) => ({
  files: [`src/modules/${self}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            regex: `^(\\.\\./)+(modules/)?(${others.join('|')})(/|$)`,
            message: `wings must not import each other (${self} → ${others.join('/')}). Cross-wing data flows through core stores.`,
          },
        ],
      },
    ],
  },
})

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
  wingRule('training', ['capital', 'watch', 'study', 'workshop']),
  wingRule('capital', ['training', 'watch', 'study', 'workshop']),
  wingRule('watch', ['training', 'capital', 'study', 'workshop']),
  wingRule('study', ['training', 'capital', 'watch', 'workshop']),
  wingRule('workshop', ['training', 'capital', 'watch', 'study']),
]
