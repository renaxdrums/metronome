import globals from 'globals';

// First stage: correctness checks across owned code. Shared classic-script
// bindings are documented in ARCHITECTURE.md; migrate those before no-undef.
export default [
  {
    ignores: [
      'node_modules/**',
      '.qa-cache/**',
      'vendor/**',
      'assets/**',
      'tests/results/**',
      'outputs/**',
      'dist/**',
    ],
  },
  {
    files: ['*.js', '*.mjs', 'prototypes/**/*.{js,mjs}', 'tools/**/*.cjs', 'tests/**/*.{cjs,mjs}'],
    languageOptions: { ecmaVersion: 'latest', globals: { ...globals.browser, ...globals.node } },
    rules: {
      'constructor-super': 'error',
      'no-async-promise-executor': 'error',
      'no-class-assign': 'error',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-const-assign': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-else-if': 'error',
      'no-dupe-keys': 'error',
      'no-func-assign': 'error',
      'no-invalid-regexp': 'error',
      'no-loss-of-precision': 'error',
      'no-self-compare': 'error',
      'no-unexpected-multiline': 'error',
      'no-unreachable': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
];
