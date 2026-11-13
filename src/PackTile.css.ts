import { globalStyle, style } from '@vanilla-extract/css';

import { theme } from './theme.css';

const DARK = '(prefers-color-scheme: dark)';

export const tile = style({
  position: 'relative',
  display: 'block',
  aspectRatio: '3 / 2',
  borderRadius: theme.radius.tile,
  overflow: 'hidden',
  background: theme.category.tint,
});

export const selected = style({
  outline: `2px solid ${theme.color.ink}`,
  outlineOffset: '2px',
});

// Line art on paper: multiply on light, inverted and screened on dark.
export const cover = style({
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  mixBlendMode: 'multiply',
  '@media': {
    [DARK]: { filter: 'invert(1)', mixBlendMode: 'screen', opacity: '0.92' },
  },
});

/** No cover yet (or none reachable): the pack name set on its own tint. */
export const fallback = style({
  position: 'absolute',
  inset: '0',
  display: 'flex',
  alignItems: 'flex-end',
  padding: '8% 40px 8% 9%',
  font: `400 clamp(13px, 1.1em, 22px)/1.08 ${theme.font.serif}`,
  letterSpacing: '-0.01em',
  color: theme.category.accent,
  overflow: 'hidden',
});

export const play = style({
  position: 'absolute',
  right: '8px',
  bottom: '8px',
  display: 'grid',
  placeItems: 'center',
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  background: theme.color.cap,
  color: theme.color.ink,
  selectors: {
    '&:hover': { background: theme.color.ink, color: theme.color.cap },
  },
});

globalStyle(`${play} svg`, { width: '14px', height: '14px' });
