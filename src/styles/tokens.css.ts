import {
  assignVars,
  createGlobalTheme,
  globalStyle,
  styleVariants,
} from '@vanilla-extract/css';

import { theme } from '../theme.css';
import { categoryColors, darkTheme, lightTheme } from '../theme-tokens';

const DARK = '(prefers-color-scheme: dark)';

const { category: _category, ...base } = theme;

createGlobalTheme(':root', base, lightTheme);
globalStyle(':root', {
  colorScheme: 'light dark',
  vars: assignVars(theme.category, categoryColors.none.light),
  '@media': {
    [DARK]: {
      vars: {
        ...assignVars(base, darkTheme),
        ...assignVars(theme.category, categoryColors.none.dark),
      },
    },
  },
});

/** Puts a category's accent, tint and ground on an element and its children. */
export const categoryTint = styleVariants(categoryColors, (colors) => ({
  vars: assignVars(theme.category, colors.light),
  '@media': { [DARK]: { vars: assignVars(theme.category, colors.dark) } },
}));
