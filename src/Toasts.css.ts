import { style, styleVariants } from '@vanilla-extract/css';

import { iconButton, smallButton } from './styles/controls.css';
import { theme } from './theme.css';

const stack = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

// Bounded so a pile of failures never pushes the bars or the sheet away; past
// that it scrolls. Only while it holds a toast, so an empty region lays out
// and paints exactly as no region.
const bounded = {
  maxHeight: '30dvh',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
} as const;

// In the window's flow above the bottom bars, so a toast never covers them;
// in a sheet, at the top of the dialog.
export const toastStack = styleVariants({
  flow: [
    stack,
    {
      flex: 'none',
      selectors: { '&:not(:empty)': { ...bounded, padding: '8px 14px' } },
    },
  ],
  sheet: [
    stack,
    {
      selectors: {
        // Stuck to the top while the sheet scrolls, so it never covers the
        // sheet's content; out to the sheet's edges so shadows are not cut.
        '&:not(:empty)': {
          ...bounded,
          position: 'sticky',
          top: '0',
          zIndex: '1',
          margin: '0 -24px',
          padding: '20px 24px 8px',
          background: theme.color.sheet,
        },
      },
    },
  ],
});

export const toastCard = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '4px 12px',
  padding: '10px 10px 10px 14px',
  borderRadius: theme.radius.tile,
  background: theme.color.ink,
  color: theme.category.ground,
  fontSize: '13px',
  boxShadow: theme.shadow.toast,
});

export const toastMessage = style({ fontWeight: '600' });

export const toastActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

export const toastAction = style([
  smallButton,
  {
    background: 'rgb(128 128 128 / 0.35)',
    color: 'inherit',
    boxShadow: 'none',
  },
]);

// On the ink card: inherit its light text, a light wash on hover.
export const dismiss = style([
  iconButton,
  {
    color: 'inherit',
    opacity: '0.7',
    selectors: {
      '&:hover': {
        color: 'inherit',
        opacity: '1',
        background: 'rgb(128 128 128 / 0.35)',
      },
    },
  },
]);

export const toastDetails = style({
  gridColumn: '1 / -1',
  fontSize: '12px',
  opacity: '0.8',
});

export const detailsSummary = style({ cursor: 'pointer' });

export const detailsText = style({
  margin: '4px 0 0',
  whiteSpace: 'pre-line',
  wordBreak: 'break-word',
  userSelect: 'text',
  WebkitUserSelect: 'text',
});
