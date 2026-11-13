import { globalStyle, style } from '@vanilla-extract/css';

import { iconButton } from './styles/controls.css';
import { theme } from './theme.css';

export const page = style({
  display: 'flex',
  flexDirection: 'column',
  flex: '1',
  minHeight: '0',
});

export const find = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flex: 'none',
  height: '52px',
  padding: '0 16px 0 10px',
  borderBottom: `1px solid ${theme.color.edge}`,
  color: theme.color.inkFaint,
});

export const back = style([
  iconButton,
  { background: theme.color.segment, color: theme.color.ink },
]);

export const searchIcon = style({ fontSize: '16px' });

export const query = style({
  flex: '1',
  minWidth: '0',
  height: '100%',
  border: '0',
  outline: 'none',
  background: 'transparent',
  color: theme.color.ink,
  fontSize: '15px',
  WebkitAppearance: 'none',
  appearance: 'none',
});

globalStyle(`${query}::-webkit-search-cancel-button`, {
  WebkitAppearance: 'none',
  appearance: 'none',
});

// The dock fades the list's last pixels; the list ends above the fade, and a
// card scrolled into view stops there.
const DOCK_FADE = '36px';

export const scroll = style({
  flex: '1',
  minHeight: '0',
  overflowY: 'auto',
  paddingBottom: DOCK_FADE,
  scrollPaddingBottom: DOCK_FADE,
});

export const words = style({ padding: '16px 22px 0' });

export const sub = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  padding: '14px 22px 12px',
  fontSize: '13px',
  color: theme.color.inkSoft,
});

export const subEnd = style({ marginLeft: 'auto' });

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '18px 12px',
  padding: '0 20px',
});

export const card = style({ minWidth: '0', fontSize: '15px' });

/** A card that does something when clicked: switch to it, get it, or download it. */
export const cardActive = style({ cursor: 'pointer' });

export const status = style({
  flex: 'none',
  font: `600 10.5px ${theme.font.mono}`,
  letterSpacing: '0.08em',
  color: theme.color.inkFaint,
  textTransform: 'uppercase',
});

export const cardPrice = style({ flex: 'none', fontSize: '13px' });

export const nameRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  minHeight: '24px',
  marginTop: '8px',
});

export const cardTag = style({
  display: 'block',
  marginTop: '8px',
  font: `600 10.5px ${theme.font.mono}`,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: theme.category.accent,
});

export const cardName = style({
  display: 'block',
  marginTop: '8px',
  font: `400 17px/1.2 ${theme.font.serif}`,
  letterSpacing: '-0.01em',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

globalStyle(`${cardTag} + ${nameRow}`, { marginTop: '2px' });
globalStyle(`${nameRow} ${cardName}`, { marginTop: '0' });
globalStyle(`${cardActive}:hover ${cardName}`, {
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
});

export const inUse = style({ color: theme.color.signal });

export const note = style({
  display: 'block',
  marginTop: '2px',
  fontSize: '12px',
  color: theme.color.inkSoft,
});

export const state = style({
  display: 'grid',
  placeItems: 'center',
  alignContent: 'center',
  gap: '10px',
  minHeight: '260px',
  padding: '0 24px',
  textAlign: 'center',
  color: theme.color.inkSoft,
  fontSize: '13px',
});

export const stateTitle = style({
  font: `400 24px/1.1 ${theme.font.serif}`,
  color: theme.color.ink,
});

export const dock = style({
  position: 'relative',
  flex: 'none',
  background: theme.category.ground,
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: `-${DOCK_FADE} 0 100% 0`,
      background: `linear-gradient(transparent, ${theme.category.ground})`,
      pointerEvents: 'none',
    },
  },
});
