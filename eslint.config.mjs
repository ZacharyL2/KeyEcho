import antfu from '@antfu/eslint-config';
import prettierConfig from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default antfu(
  {
    stylistic: false,

    vue: {
      overrides: {
        'vue/attribute-hyphenation': [2, 'never'],
      },
    },

    typescript: {
      overrides: {
        'ts/consistent-type-imports': [
          2,
          {
            fixStyle: 'inline-type-imports',
          },
        ],
      },
    },

    javascript: {
      overrides: {
        'no-console': 1,
        'unused-imports/no-unused-vars': 1,
      },
    },
  },

  prettierConfig,

  {
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      'sort-imports': 0,
      'import/order': 0,
      'simple-import-sort/imports': 1,
      'simple-import-sort/exports': 1,
    },
  },

  {
    ignores: ['**/src-tauri/**', '**/bindings.ts'],
  },
);
