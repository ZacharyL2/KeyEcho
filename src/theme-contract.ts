import { createGlobalThemeContract } from '@vanilla-extract/css';

export const theme = createGlobalThemeContract({
  color: {
    sheet: 'sheet',
    up: 'up',
    edge: 'edge',
    edgeStrong: 'edge-strong',
    ink: 'ink',
    inkSoft: 'ink-soft',
    inkFaint: 'ink-faint',
    signal: 'signal',
    price: 'price',
    priceOnInk: 'price-on-ink',
    segment: 'segment',
    strip: 'strip',
    scrim: 'scrim',
    cap: 'cap',
  },
  // Set per category: the window, and each pack card on its own.
  category: {
    accent: 'accent',
    tint: 'tint',
    ground: 'ground',
    well: 'well',
  },
  shadow: {
    cap: 'shadow-cap',
    sheet: 'shadow-sheet',
    toast: 'shadow-toast',
  },
  font: {
    sans: 'font-sans',
    serif: 'font-serif',
    mono: 'font-mono',
  },
  radius: {
    key: 'radius-key',
    control: 'radius-control',
    tile: 'radius-tile',
    panel: 'radius-panel',
  },
});
