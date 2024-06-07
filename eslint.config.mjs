import antfu from '@antfu/eslint-config';
import prettierConfig from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default antfu(
  {
    vue: true,
    stylistic: false,
    typescript: true,
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
    rules: {
      'no-console': 1,
      'unused-imports/no-unused-vars': 1,
      'vue/attribute-hyphenation': [2, 'never'],
      'ts/consistent-type-imports': [
        2,
        {
          fixStyle: 'inline-type-imports',
        },
      ],
    },
  },

  {
    ignores: ['**/src-tauri/**', '**/bindings.ts'],
  },
);
