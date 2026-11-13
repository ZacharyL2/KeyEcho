import { globalStyle } from '@vanilla-extract/css';

import { theme } from '../theme.css';

globalStyle('*, *::before, *::after', { boxSizing: 'border-box' });
globalStyle('html', {
  WebkitTextSizeAdjust: '100%',
  textSizeAdjust: '100%',
});
globalStyle('html, body', { height: '100%', overflow: 'hidden' });
globalStyle('body', {
  margin: '0',
  background: theme.category.ground,
  color: theme.color.ink,
  font: `14px/1.5 ${theme.font.sans}`,
  WebkitFontSmoothing: 'antialiased',
  userSelect: 'none',
  WebkitUserSelect: 'none',
});
globalStyle('button, input', {
  margin: '0',
  font: 'inherit',
  color: 'inherit',
});
globalStyle('button', {
  WebkitAppearance: 'none',
  appearance: 'none',
  background: 'none',
  border: '0',
  padding: '0',
  cursor: 'pointer',
});
globalStyle('button:disabled', { cursor: 'default' });
globalStyle('input', { userSelect: 'text', WebkitUserSelect: 'text' });
globalStyle('h1, h2, h3, h4, p', { margin: '0' });
globalStyle(':focus-visible', {
  outline: `2px solid ${theme.color.ink}`,
  outlineOffset: '2px',
});
globalStyle('::placeholder', { color: theme.color.inkFaint, opacity: '1' });

globalStyle('::-webkit-scrollbar', {
  '@supports': {
    'selector(::-webkit-scrollbar)': { width: '8px', height: '8px' },
  },
});
globalStyle('::-webkit-scrollbar-track, ::-webkit-scrollbar-corner', {
  '@supports': {
    'selector(::-webkit-scrollbar)': { background: 'transparent' },
  },
});
globalStyle('::-webkit-scrollbar-thumb', {
  '@supports': {
    'selector(::-webkit-scrollbar)': {
      border: '2px solid transparent',
      borderRadius: '8px',
      background: `${theme.color.edgeStrong} padding-box`,
    },
  },
});

globalStyle('*', {
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animationDuration: '0s !important',
      transitionDuration: '0s !important',
    },
  },
});
