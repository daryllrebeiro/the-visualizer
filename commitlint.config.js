/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', // New feature
        'fix', // Bug fix
        'docs', // Documentation only
        'style', // Formatting, no code change
        'refactor', // Refactoring
        'perf', // Performance improvement
        'test', // Adding or fixing tests
        'build', // Build system or deps
        'ci', // CI configuration
        'chore', // Maintenance
        'revert', // Reverting a commit
        'security', // Security fix
      ],
    ],
    'scope-case': [2, 'always', 'kebab-case'],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 120],
  },
};
