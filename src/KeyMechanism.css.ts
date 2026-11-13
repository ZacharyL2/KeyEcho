import { style } from '@vanilla-extract/css';

import { theme } from './theme.css';

export const drawing = style({
  position: 'absolute',
  right: '24px',
  top: '26px',
  // No pixel cap: the window has a max size, so the drawing grows with the sleeve.
  width: '56%',
  // Ends 76px above the bottom, clear of the Change pack button.
  height: 'calc(100% - 102px)',
  color: theme.color.ink,
  overflow: 'visible',
  '@container': {
    // Narrow sleeves give the pack name the room.
    '(max-width: 640px)': { width: '40%' },
    '(max-width: 460px)': { display: 'none' },
  },
});

export const line = style({
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
});

export const thin = style({ strokeWidth: 1.2 });
export const thick = style({ strokeWidth: 2.2 });
export const paper = style({ fill: theme.category.tint });
export const solid = style({ fill: 'currentColor' });
export const mass = style({ fill: theme.color.segment });
export const dish = style({ stroke: theme.color.edgeStrong, strokeWidth: 1.2 });
export const wave = style({ stroke: theme.category.accent });
