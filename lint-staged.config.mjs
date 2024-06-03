export default {
  '*.{md,json,css,html}': ['prettier --cache --write'],
  '*.{vue,ts?(x)}': ['eslint --fix', 'prettier --cache --write'],
};
