import { style } from '@vanilla-extract/css';

import { theme } from './theme.css';

export const words = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '2px 18px',
  font: `400 29px/1.28 ${theme.font.serif}`,
  letterSpacing: '-0.02em',
});

export const big = style({ fontSize: '30px', gap: '0 18px' });

// Search covers every character, so the words step back.
export const greyed = style({ opacity: '0.45' });

export const word = style({
  font: 'inherit',
  letterSpacing: 'inherit',
  color: theme.color.inkFaint,
  borderRadius: theme.radius.key,
  selectors: {
    '&:hover': { color: theme.color.inkSoft },
    '&[aria-pressed="true"]': {
      color: theme.color.ink,
      textDecoration: 'underline',
      textDecorationColor: theme.category.accent,
      textDecorationThickness: '3px',
      textUnderlineOffset: '6px',
      textDecorationSkipInk: 'none',
    },
  },
});
