export default {
  '*.{md,json,css,html}': ['oxfmt'],
  '*.{vue,ts?(x)}': ['oxlint --fix', 'oxfmt'],
};
