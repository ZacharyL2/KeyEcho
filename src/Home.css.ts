import { createVar, globalStyle, style } from '@vanilla-extract/css';

import { tile } from './PackTile.css';
import { button, controlHeight, monoLabel } from './styles/controls.css';
import { theme } from './theme.css';

/** Scrolls when the window is short; the hint row stays put below it. */
export const body = style({
  flex: '1',
  minHeight: '0',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
});

/** Takes the window's spare height, so a tall window shows more art, not a gap. */
export const sleeve = style({
  flex: '1 0 auto',
  display: 'flex',
  flexDirection: 'column',
  margin: '10px 10px 0',
  borderRadius: theme.radius.panel,
  overflow: 'hidden',
  background: theme.category.tint,
});

export const art = style({
  position: 'relative',
  overflow: 'hidden',
  flex: '1 0 auto',
  minHeight: 'clamp(200px, 36dvh, 300px)',
  containerType: 'inline-size',
});

export const dimmed = style({});

globalStyle(`${dimmed} > svg`, { opacity: '0.3' });

export const top = style({
  position: 'absolute',
  inset: '14px 14px auto 14px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const titleBlock = style({
  position: 'absolute',
  left: '20px',
  bottom: '20px',
  // Stops 16px short of the drawing (right 24px, width per KeyMechanism.css.ts).
  maxWidth: 'calc(44% - 60px)',
  '@container': {
    '(max-width: 640px)': { maxWidth: 'calc(60% - 60px)' },
    // Clear of the Change pack button.
    '(max-width: 460px)': { maxWidth: '55%' },
  },
});

export const category = style([monoLabel, { color: theme.category.accent }]);

export const packName = style({
  margin: '8px 0 0',
  font: `400 clamp(36px, 7dvw, 60px)/0.98 ${theme.font.serif}`,
  letterSpacing: '-0.025em',
  color: theme.color.ink,
  overflowWrap: 'break-word',
});

globalStyle(`${dimmed} ${packName}`, { color: theme.color.inkSoft });

export const tagline = style({
  margin: '12px 0 0',
  fontSize: '13px',
  lineHeight: '1.35',
  color: theme.color.inkSoft,
});

/** Same light surface as the Unlock chip above it, so the sleeve reads as one set. */
export const changePack = style([
  button,
  {
    position: 'absolute',
    right: '14px',
    bottom: '16px',
    paddingRight: '8px',
    background: theme.color.strip,
    color: theme.color.ink,
    transition: 'background-color 120ms ease-out, box-shadow 120ms ease-out',
    selectors: {
      '&:hover': { background: theme.color.cap, boxShadow: theme.shadow.cap },
    },
  },
]);

export const tape = style({
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  height: '46px',
  padding: '0 14px 0 20px',
  background: theme.color.strip,
});

export const tapeMessage = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  fontSize: '12.5px',
  color: theme.color.inkSoft,
  whiteSpace: 'nowrap',
});

export const controls = style({ padding: '2px 24px 0' });

export const row = style({
  display: 'flex',
  alignItems: 'center',
  gap: '18px',
  minHeight: '52px',
  selectors: {
    '& + &': { borderTop: `1px solid ${theme.color.edge}` },
  },
});

export const volumeRow = style({
  minHeight: '68px',
  alignItems: 'flex-end',
  paddingBottom: '12px',
});

export const volumeNumber = style({ width: '84px', flex: 'none' });

export const volumeValue = style({
  display: 'block',
  marginTop: '2px',
  font: `400 30px/1 ${theme.font.serif}`,
  letterSpacing: '-0.02em',
  color: theme.color.ink,
  fontVariantNumeric: 'lining-nums tabular-nums',
  // Keeps the row's height while there is no number to show.
  minHeight: '1em',
});

export const volumeMuted = style({ color: theme.color.inkFaint });

export const faderLevel = createVar();

export const fader = style({
  position: 'relative',
  height: '14px',
  cursor: 'pointer',
  touchAction: 'none',
  vars: { '--seg': 'calc(100% / 30)' },
  background: `repeating-linear-gradient(90deg, ${theme.color.segment} 0 calc(var(--seg) - 3px), transparent 0 var(--seg))`,
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: '0',
      // The pack's own colour, so the fader belongs to the sleeve above it.
      background: `repeating-linear-gradient(90deg, ${theme.category.accent} 0 calc(var(--seg) - 3px), transparent 0 var(--seg))`,
      clipPath: `inset(0 calc(100% - ${faderLevel}) 0 0)`,
    },
    '&[aria-disabled="true"]': { cursor: 'default', opacity: '0.6' },
  },
});

export const scale = style({
  position: 'relative',
  height: '14px',
  marginTop: '5px',
  font: `10px/14px ${theme.font.mono}`,
  color: theme.color.inkFaint,
});

export const scaleMark = style({
  position: 'absolute',
  top: '0',
  transform: 'translateX(-50%)',
  selectors: {
    '&:first-child': { transform: 'none' },
    '&:last-child': { transform: 'translateX(-100%)' },
  },
});

export const segmented = style({
  display: 'inline-flex',
  padding: '2px',
  borderRadius: theme.radius.control,
  background: theme.color.segment,
});

export const segment = style({
  height: '24px',
  padding: '0 12px',
  borderRadius: theme.radius.key,
  font: `600 10.5px/24px ${theme.font.mono}`,
  letterSpacing: '0.08em',
  color: theme.color.inkFaint,
  selectors: {
    '&[aria-pressed="true"]': {
      background: theme.color.ink,
      color: theme.category.ground,
    },
  },
});

export const foot = style({
  display: 'flex',
  alignItems: 'center',
  gap: '18px',
  minHeight: '50px',
  padding: '0 24px',
  borderTop: `1px solid ${theme.color.edge}`,
});

/** Top right of the sleeve, level with the READY chip: the way to own every pack. */
export const unlock = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  height: controlHeight.inline,
  padding: '0 9px',
  borderRadius: theme.radius.control,
  background: theme.color.strip,
  font: `600 12px ${theme.font.sans}`,
  color: theme.color.ink,
  whiteSpace: 'nowrap',
  transition: 'background-color 120ms ease-out, box-shadow 120ms ease-out',
  selectors: {
    '&:hover': { background: theme.color.cap, boxShadow: theme.shadow.cap },
  },
});

export const unlockCount = style({
  font: `600 10.5px ${theme.font.mono}`,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  opacity: '0.6',
});

export const unlockPrice = style({
  color: theme.color.price,
  fontWeight: '650',
  fontVariantNumeric: 'tabular-nums',
});

export const ownerBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  height: controlHeight.inline,
  padding: '0 9px',
  borderRadius: theme.radius.control,
  background: theme.color.strip,
  font: `600 10.5px ${theme.font.mono}`,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: theme.color.signal,
});

export const hint = style({
  display: 'flex',
  alignItems: 'center',
  gap: '18px',
  flex: 'none',
  height: '42px',
  padding: '0 18px',
  containerType: 'inline-size',
  background: theme.category.well,
  font: `11.5px ${theme.font.mono}`,
  color: theme.color.inkFaint,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
});

export const hintKey = style({
  display: 'inline-grid',
  placeItems: 'center',
  minWidth: '26px',
  height: '24px',
  marginRight: '6px',
  padding: '0 7px',
  fontSize: '11.5px',
});

/** A single-key hint: the whole hint is the button. */
export const hintButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  height: '32px',
  padding: '0 8px 0 4px',
  borderRadius: theme.radius.control,
  font: 'inherit',
  color: 'inherit',
  selectors: {
    '&:hover': { color: theme.color.ink, background: theme.color.segment },
  },
});

globalStyle(`${hintButton}:hover ${hintKey}`, { color: theme.color.ink });

/** A paired hint (← →): each glyph is its own button inside one cap. */
/** A paired hint shows one small cap per key, like real arrow keys. */
export const hintKeys = style({
  display: 'inline-flex',
  gap: '3px',
  padding: '0',
  background: 'transparent',
});

export const hintGlyph = style({
  display: 'inline-grid',
  placeItems: 'center',
  width: '24px',
  height: '24px',
  font: 'inherit',
  color: 'inherit',
  background: theme.color.segment,
  borderRadius: theme.radius.key,
  selectors: {
    '&:hover': { color: theme.color.ink, background: theme.color.edgeStrong },
  },
});

export const hintLabel = style({
  '@container': {
    // Narrow rows keep the keys and drop the words.
    '(max-width: 560px)': { display: 'none' },
  },
});

/** ← → and ↑ ↓: the first hints to go when the row is very narrow. */
export const hintPair = style({
  '@container': {
    '(max-width: 380px)': { display: 'none' },
  },
});

/* First launch: the sleeve holds the eight words and one starter pack. */
export const first = style({
  position: 'relative',
  padding: '50px 20px 16px',
  minHeight: '270px',
  display: 'flex',
  flexDirection: 'column',
});

export const firstPrompt = style({
  margin: '0 0 10px',
  fontSize: '14px',
  fontWeight: '580',
  color: theme.color.ink,
});

export const starter = style({
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  marginTop: 'auto',
  paddingTop: '18px',
});

export const starterTile = style({
  width: '132px',
  selectors: { [`${tile}&`]: { background: theme.color.strip } },
  flex: 'none',
  fontSize: '13px',
});

export const starterName = style({
  display: 'block',
  font: `400 24px/1.1 ${theme.font.serif}`,
  letterSpacing: '-0.02em',
});

export const starterMeta = style({
  margin: '3px 0 0',
  fontSize: '12.5px',
  color: theme.color.inkSoft,
});

// Stands where the number would be, at the number's height.
export const volumeRetry = style({
  display: 'flex',
  alignItems: 'center',
  height: '42px',
  marginTop: '2px',
});
