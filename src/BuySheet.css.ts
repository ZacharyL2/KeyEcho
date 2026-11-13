import { style } from '@vanilla-extract/css';

import {
  amount,
  amountWas,
  button,
  controlHeight,
} from './styles/controls.css';
import { theme } from './theme.css';

export const what = style({
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
});

export const whatTile = style({
  width: '108px',
  flex: 'none',
  fontSize: '13px',
});

export const whatName = style({
  display: 'block',
  font: `400 26px/1.1 ${theme.font.serif}`,
  letterSpacing: '-0.02em',
});

export const whatCopy = style({
  margin: '4px 0 0',
  fontSize: '13px',
  color: theme.color.inkSoft,
});

/** The price being paid while checkout is open: big enough to read at a glance. */
export const whatPrice = style({
  display: 'inline-block',
  marginTop: '4px',
  font: `650 26px/1.1 ${theme.font.sans}`,
  letterSpacing: '-0.01em',
});

export const options = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '10px',
  marginTop: '16px',
});

export const option = style({
  display: 'block',
  textAlign: 'left',
  padding: '13px 14px 14px',
  borderRadius: theme.radius.tile,
  boxShadow: `inset 0 0 0 1px ${theme.color.edgeStrong}`,
  selectors: {
    '&[aria-checked="true"]': {
      boxShadow: `inset 0 0 0 2px ${theme.color.ink}`,
    },
  },
});

export const optionTop = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontWeight: '600',
});

export const radio = style({
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  boxShadow: `inset 0 0 0 1.5px ${theme.color.edgeStrong}`,
  selectors: {
    '[aria-checked="true"] &': {
      boxShadow: `inset 0 0 0 5px ${theme.color.ink}`,
    },
  },
});

export const optionAmount = style([
  amount,
  {
    display: 'block',
    marginTop: '8px',
    fontSize: '24px',
    lineHeight: '1.1',
    letterSpacing: '-0.02em',
  },
]);

export const optionWas = style([
  amountWas,
  { fontSize: '13px', letterSpacing: '0' },
]);

export const optionCopy = style({
  display: 'block',
  margin: '6px 0 0',
  fontSize: '12.5px',
  lineHeight: '1.4',
  color: theme.color.inkSoft,
});

export const optionTerms = style({
  display: 'block',
  marginTop: '6px',
  font: `600 10.5px ${theme.font.mono}`,
  letterSpacing: '0.06em',
  color: theme.color.inkFaint,
  textTransform: 'uppercase',
});

export const continueButton = style([
  button,
  {
    width: '100%',
    height: controlHeight.large,
    marginTop: '14px',
    fontSize: '14.5px',
    fontWeight: '650',
  },
]);

export const wait = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginTop: '16px',
  padding: '14px',
  borderRadius: theme.radius.tile,
  background: theme.category.well,
  fontSize: '13px',
});
