import { keyframes, style, styleVariants } from '@vanilla-extract/css';

import { theme } from '../theme.css';

/**
 * The only control heights. inline: chips and badges in a line of text;
 * small: secondary buttons, toggles, icon buttons; regular: the ink button,
 * fields; large: the one checkout action.
 */
export const controlHeight = {
  inline: '24px',
  small: '28px',
  regular: '36px',
  large: '44px',
} as const;

export const grow = style({ flex: '1', minWidth: '0' });

export const monoLabel = style({
  font: `600 10.5px ${theme.font.mono}`,
  letterSpacing: '0.08em',
  color: theme.color.inkFaint,
  textTransform: 'uppercase',
});

export const kbd = style({
  display: 'inline-block',
  font: `600 10.5px ${theme.font.mono}`,
  color: theme.color.inkSoft,
  background: theme.color.segment,
  padding: '2px 6px 3px',
  borderRadius: theme.radius.key,
  whiteSpace: 'nowrap',
});

export const keycap = style({
  display: 'inline-block',
  minWidth: '2.2em',
  textAlign: 'center',
  font: `600 12px ${theme.font.mono}`,
  color: theme.color.ink,
  background: theme.color.cap,
  padding: '4px 10px 5px',
  borderRadius: theme.radius.control,
  boxShadow: theme.shadow.cap,
});

export const price = style({
  color: theme.color.price,
  fontWeight: '650',
  fontVariantNumeric: 'tabular-nums',
});

/** Offer amount: struck regular price, then the price you pay. */
export const amount = style({
  font: `650 17px ${theme.font.sans}`,
  color: theme.color.price,
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
});

export const amountWas = style({
  fontSize: '12.5px',
  fontWeight: '400',
  color: theme.color.inkFaint,
  marginRight: '7px',
  textDecorationThickness: '1px',
});

export const promoCode = style({
  display: 'inline-block',
  font: `600 11px ${theme.font.mono}`,
  letterSpacing: '0.06em',
  padding: '1px 6px',
  borderRadius: theme.radius.key,
  border: '1px dashed currentColor',
  userSelect: 'text',
  WebkitUserSelect: 'text',
});

const chipBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: controlHeight.inline,
  padding: '0 9px',
  borderRadius: theme.radius.control,
  background: theme.color.strip,
  font: `600 10.5px ${theme.font.mono}`,
  letterSpacing: '0.08em',
  color: theme.color.ink,
  textTransform: 'uppercase',
});

export const chip = styleVariants({
  on: [chipBase],
  off: [chipBase, { color: theme.color.inkSoft }],
});

export const chipDot = styleVariants({
  on: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: theme.color.signal,
  },
  off: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    boxShadow: `inset 0 0 0 1.5px ${theme.color.inkFaint}`,
  },
});

/** The one solid ink button. */
export const button = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  height: controlHeight.regular,
  padding: '0 14px',
  borderRadius: theme.radius.control,
  background: theme.color.ink,
  color: theme.category.ground,
  fontWeight: '600',
  fontSize: '13px',
  whiteSpace: 'nowrap',
  selectors: {
    '&:disabled': { opacity: '0.55' },
  },
});

export const buttonKbd = style({
  font: `600 10.5px ${theme.font.mono}`,
  background: 'rgb(128 128 128 / 0.3)',
  color: 'inherit',
  padding: '2px 6px 3px',
  borderRadius: theme.radius.key,
});

export const smallButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  height: controlHeight.small,
  padding: '0 10px',
  borderRadius: theme.radius.control,
  background: theme.color.up,
  color: theme.color.ink,
  fontWeight: '600',
  fontSize: '12px',
  boxShadow: `inset 0 0 0 1px ${theme.color.edgeStrong}`,
  whiteSpace: 'nowrap',
  selectors: {
    '&:disabled': { opacity: '0.55' },
  },
});

/** A bare icon that acts: close, dismiss, back. */
export const iconButton = style({
  display: 'grid',
  placeItems: 'center',
  flex: 'none',
  width: controlHeight.small,
  height: controlHeight.small,
  borderRadius: theme.radius.control,
  color: theme.color.inkFaint,
  fontSize: '16px',
  transition: 'background-color 120ms ease-out, color 120ms ease-out',
  selectors: {
    '&:hover': { background: theme.color.segment, color: theme.color.ink },
  },
});

export const textLink = style({
  color: theme.color.inkSoft,
  fontSize: '12.5px',
  selectors: {
    '&:hover': { color: theme.color.ink },
  },
});

export const visuallyHidden = style({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
});

const spin = keyframes({ to: { transform: 'rotate(360deg)' } });

/** Turns an icon (the loading glyph) in place. */
export const spinning = style({
  animation: `${spin} 0.9s linear infinite`,
});

export const spinner = style({
  width: '14px',
  height: '14px',
  flex: 'none',
  boxSizing: 'border-box',
  borderRadius: '50%',
  border: `2px solid ${theme.color.edgeStrong}`,
  borderTopColor: theme.color.ink,
  animation: `${spin} 0.9s linear infinite`,
});
