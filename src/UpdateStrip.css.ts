import { style } from '@vanilla-extract/css';

import { iconButton } from './styles/controls.css';
import { theme } from './theme.css';

export const updateStrip = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  margin: '0 10px 14px',
  padding: '6px 6px 6px 14px',
  minHeight: '36px',
  borderRadius: theme.radius.tile,
  background: theme.category.well,
  fontSize: '13px',
});

export const version = style({ fontWeight: '600' });

export const title = style({ color: theme.color.inkSoft });

export const cta = style({
  color: theme.color.ink,
  fontWeight: '600',
  fontSize: '12.5px',
  selectors: {
    '&:hover': { textDecoration: 'underline' },
  },
});

export const dismiss = iconButton;
