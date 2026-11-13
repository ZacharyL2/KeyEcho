import { globalStyle, style } from '@vanilla-extract/css';

import { monoLabel } from './styles/controls.css';
import { theme } from './theme.css';

export const rows = style({ marginTop: '14px' });

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  minHeight: '52px',
  selectors: {
    '& + &': { borderTop: `1px solid ${theme.color.edge}` },
  },
});

export const label = style([
  monoLabel,
  { flex: '1', minWidth: '0', color: theme.color.inkSoft },
]);

export const value = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '12px',
});

// One control column: every button and the toggle share a width and height,
// so their left and right edges line up row to row.
const CONTROL_WIDTH = '92px';
globalStyle(`${value} > button`, { width: CONTROL_WIDTH });
globalStyle(`${value} > [role="group"]`, { width: CONTROL_WIDTH });
globalStyle(`${value} > [role="group"] > button`, { flex: '1', padding: '0' });

export const status = style({ fontSize: '13px', color: theme.color.inkSoft });

export const owned = style({ color: theme.color.signal, fontWeight: '600' });
