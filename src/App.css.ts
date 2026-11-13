import { style } from '@vanilla-extract/css';

import { theme } from './theme.css';

export const root = style({
  height: '100%',
  overflow: 'hidden',
});

/** Everything behind a sheet; inert while one is open. No box of its own. */
export const page = style({
  display: 'contents',
});

/** The whole window; its category class sets the accent, tint and ground. */
export const window = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  height: '100dvh',
  overflow: 'hidden',
  background: theme.category.ground,
  color: theme.color.ink,
});
