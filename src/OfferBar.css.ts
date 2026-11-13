import { globalStyle, style, styleVariants } from '@vanilla-extract/css';

import { button, controlHeight } from './styles/controls.css';
import { theme } from './theme.css';

const base = style({
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
});

// Black Friday is an ink bar so it reads first; the regular offer sits on the well.
export const bar = styleVariants({
  dock: [
    base,
    {
      padding: '12px 12px 12px 22px',
      background: theme.color.ink,
      color: theme.category.ground,
    },
  ],
  dockRegular: [
    base,
    {
      padding: '12px 12px 12px 22px',
      background: theme.category.well,
      color: theme.color.ink,
    },
  ],
  slim: [
    base,
    {
      margin: '0 10px 10px',
      borderRadius: theme.radius.tile,
      padding: '9px 9px 9px 14px',
      gap: '10px',
      fontSize: '13px',
      background: theme.color.ink,
      color: theme.category.ground,
    },
  ],
});

export const eyebrow = style({
  display: 'block',
  marginBottom: '3px',
  font: `600 10.5px ${theme.font.mono}`,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  opacity: '0.7',
});

export const title = style({
  display: 'block',
  font: `400 20px/1.2 ${theme.font.serif}`,
  letterSpacing: '-0.01em',
});

// A long promo name gives way first; the rest of the line, the price and the
// button never shrink.
export const slimTitle = style({
  minWidth: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: '600',
});

export const copy = style({
  margin: '3px 0 0',
  fontSize: '12.5px',
  opacity: '0.8',
});

export const amount = styleVariants({
  onInk: {
    font: `650 24px ${theme.font.sans}`,
    letterSpacing: '-0.02em',
    color: theme.color.priceOnInk,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  onInkSlim: {
    font: `650 17px ${theme.font.sans}`,
    color: theme.color.priceOnInk,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
  regular: {
    font: `650 24px ${theme.font.sans}`,
    letterSpacing: '-0.02em',
    color: theme.color.price,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
  },
});

export const was = style({
  marginRight: '7px',
  fontSize: '13px',
  fontWeight: '400',
  letterSpacing: '0',
  opacity: '0.75',
  textDecorationThickness: '1px',
});

export const getButton = styleVariants({
  regular: [button],
  ink: [button, { background: theme.category.ground, color: theme.color.ink }],
  inkSlim: [
    button,
    {
      background: theme.category.ground,
      color: theme.color.ink,
      height: controlHeight.small,
      fontSize: '12px',
      padding: '0 10px',
    },
  ],
});

export const cancel = style({
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
});

globalStyle(`${bar.slim} s, ${bar.dock} s`, { color: 'inherit' });

export const slimLine = style({
  display: 'flex',
  alignItems: 'baseline',
  flex: '1',
  minWidth: '0',
});

export const slimRest = style({ flex: 'none', whiteSpace: 'pre' });
