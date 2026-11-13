import { globalStyle, style } from '@vanilla-extract/css';

import { iconButton } from './styles/controls.css';
import { theme } from './theme.css';

export const scrim = style({
  position: 'absolute',
  inset: '0',
  zIndex: '40',
  background: theme.color.scrim,
});

export const sheet = style({
  position: 'absolute',
  inset: 'auto 0 0',
  zIndex: '50',
  maxHeight: 'calc(100dvh - 24px)',
  overflowY: 'auto',
  // A toast arriving at the top pushes the content down, as in WebKit, which
  // has no scroll anchoring; the heading stays in view under it.
  overflowAnchor: 'none',
  padding: '0 24px 14px',
  borderRadius: `${theme.radius.panel} ${theme.radius.panel} 0 0`,
  background: theme.color.sheet,
  color: theme.color.ink,
  boxShadow: theme.shadow.sheet,
  outline: 'none',
});

export const heading = style({
  font: `400 26px/1.1 ${theme.font.serif}`,
  letterSpacing: '-0.02em',
});

export const fine = style({
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  margin: '12px 0 0',
  fontSize: '12.5px',
  color: theme.color.inkSoft,
});

export const fineKeys = style({
  font: `10.5px ${theme.font.mono}`,
  color: theme.color.inkFaint,
  whiteSpace: 'nowrap',
});

globalStyle(`${fineKeys} kbd`, { marginRight: '4px' });

// The sheet's top padding sits below the toasts; the panel itself has none, so
// a toast stuck to the top sits flush with the sheet's edge.
export const body = style({ position: 'relative', paddingTop: '20px' });

// Centred on the heading's first line.
export const close = style([
  iconButton,
  { position: 'absolute', top: '20px', right: '-8px' },
]);
