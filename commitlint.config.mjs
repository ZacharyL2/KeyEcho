export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // `release: v1.1.0` is this repo's existing release-commit convention.
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'release'],
    ],
  },
};
