import { style } from '@vanilla-extract/css';

import { button, controlHeight, smallButton } from './styles/controls.css';
import { theme } from './theme.css';

export const headingRow = style({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '12px',
});

export const pair = style({
  display: 'flex',
  gap: '10px',
  alignItems: 'flex-end',
  marginTop: '16px',
});

export const field = style({
  display: 'grid',
  gap: '6px',
  flex: '1',
  minWidth: '0',
});

export const label = style({ fontSize: '12.5px', fontWeight: '600' });

export const input = style({
  height: controlHeight.regular,
  padding: '0 12px',
  border: '0',
  borderRadius: theme.radius.control,
  background: 'transparent',
  boxShadow: `inset 0 0 0 1px ${theme.color.edgeStrong}`,
  color: theme.color.ink,
  font: `13px ${theme.font.mono}`,
  outline: 'none',
  selectors: {
    '&:focus-visible': { boxShadow: `inset 0 0 0 2px ${theme.color.ink}` },
  },
});

export const textInput = style({ fontFamily: theme.font.sans });

export const invalid = style({
  boxShadow: `inset 0 0 0 2px ${theme.color.ink}`,
});

export const pairButton = style([button, { padding: '0 18px' }]);

export const pairSmallButton = style([
  smallButton,
  { height: controlHeight.regular, padding: '0 14px' },
]);

export const message = style({
  marginTop: '8px',
  fontSize: '12.5px',
  color: theme.color.inkSoft,
});

export const messageStrong = style({
  color: theme.color.ink,
  fontWeight: '600',
});

export const inline = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '6px 12px',
  marginTop: '8px',
  fontSize: '12.5px',
  color: theme.color.inkSoft,
});

export const details = style({ width: '100%', fontSize: '12px' });

export const detailsText = style({
  margin: '4px 0 0',
  wordBreak: 'break-word',
  userSelect: 'text',
  WebkitUserSelect: 'text',
});

export const rule = style({
  border: '0',
  borderTop: `1px solid ${theme.color.edge}`,
  margin: '20px 0 0',
});

export const packs = style({ marginTop: '14px' });

export const packRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minHeight: '40px',
  selectors: {
    '& + &': { borderTop: `1px solid ${theme.color.edge}` },
  },
});

export const packName = style({
  flex: '1',
  minWidth: '0',
  font: `400 16px/1.2 ${theme.font.serif}`,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
