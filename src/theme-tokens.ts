import type { CategoryId } from './packs';

// The app's only colour source. Light is the default look; dark follows the
// system appearance. Category colours are precomputed (accent, plus the accent
// mixed into paper) because older system webviews lack oklch() and color-mix().

const shared = {
  font: {
    sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    serif:
      'ui-serif, "New York", "Iowan Old Style", "Palatino Linotype", Georgia, serif',
    mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  },
  radius: { key: '3px', control: '4px', tile: '6px', panel: '8px' },
};

export const lightTheme = {
  ...shared,
  color: {
    sheet: '#ffffff',
    up: 'rgb(255 255 255 / 0.7)',
    edge: 'rgb(0 0 0 / 0.1)',
    edgeStrong: 'rgb(0 0 0 / 0.24)',
    ink: '#1b1b1b',
    inkSoft: '#484848',
    inkFaint: '#696969',
    signal: '#267543',
    price: '#b71a18',
    priceOnInk: '#ff8576',
    segment: 'rgb(0 0 0 / 0.1)',
    strip: 'rgb(255 255 255 / 0.6)',
    scrim: 'rgb(22 22 22 / 0.42)',
    cap: '#ffffff',
  },
  shadow: {
    cap: '0 0 0 1px rgb(0 0 0 / 0.14), 0 2px 0 rgb(0 0 0 / 0.18)',
    sheet: '0 -12px 40px rgb(0 0 0 / 0.3)',
    toast: '0 8px 24px rgb(0 0 0 / 0.25)',
  },
};

export const darkTheme = {
  ...shared,
  color: {
    sheet: '#1c1e21',
    up: 'rgb(255 255 255 / 0.08)',
    edge: 'rgb(255 255 255 / 0.09)',
    edgeStrong: 'rgb(255 255 255 / 0.22)',
    ink: '#ebebeb',
    inkSoft: '#b1b1b1',
    inkFaint: '#808080',
    signal: '#71e2ca',
    price: '#fd7466',
    priceOnInk: '#b00d10',
    segment: 'rgb(255 255 255 / 0.12)',
    strip: 'rgb(0 0 0 / 0.3)',
    scrim: 'rgb(2 2 2 / 0.62)',
    cap: 'rgb(255 255 255 / 0.1)',
  },
  shadow: {
    cap: 'inset 0 1px 0 rgb(255 255 255 / 0.1), 0 2px 0 rgb(0 0 0 / 0.6)',
    sheet: '0 -12px 40px rgb(0 0 0 / 0.5)',
    toast: '0 8px 24px rgb(0 0 0 / 0.5)',
  },
};

interface CategoryColors {
  accent: string;
  tint: string;
  ground: string;
  well: string;
}

/** Light accent oklch(47% 0.09·c h); tint 13%, ground 4%, well 9% of it in paper. Dark: oklch(78% 0.08·c h) over oklch grounds of the same hue. */
export const categoryColors: Record<
  CategoryId | 'none',
  { light: CategoryColors; dark: CategoryColors }
> = {
  clicky: {
    light: {
      accent: '#305e8b',
      tint: '#dee5ec',
      ground: '#f1f3f6',
      well: '#e2e7eb',
    },
    dark: {
      accent: '#90bce9',
      tint: '#1c2834',
      ground: '#121518',
      well: '#0a0d10',
    },
  },
  thocky: {
    light: {
      accent: '#814c24',
      tint: '#eae2dd',
      ground: '#f5f3f1',
      well: '#ebe5e1',
    },
    dark: {
      accent: '#e0aa86',
      tint: '#312319',
      ground: '#181412',
      well: '#0f0b09',
    },
  },
  tactile: {
    light: {
      accent: '#634e86',
      tint: '#e5e2eb',
      ground: '#f3f3f5',
      well: '#e7e5eb',
    },
    dark: {
      accent: '#bface4',
      tint: '#282332',
      ground: '#151418',
      well: '#0d0b0f',
    },
  },
  linear: {
    light: {
      accent: '#006a66',
      tint: '#dce7e5',
      ground: '#f1f4f4',
      well: '#e0e8e7',
    },
    dark: {
      accent: '#77c8c3',
      tint: '#152b29',
      ground: '#111616',
      well: '#080d0d',
    },
  },
  'silent-office': {
    light: {
      accent: '#545b68',
      tint: '#e3e4e6',
      ground: '#f3f3f4',
      well: '#e5e6e7',
    },
    dark: {
      accent: '#b0b8c5',
      tint: '#24272a',
      ground: '#141516',
      well: '#0c0c0d',
    },
  },
  typewriter: {
    light: {
      accent: '#6f5448',
      tint: '#e7e3e1',
      ground: '#f4f3f2',
      well: '#e8e5e4',
    },
    dark: {
      accent: '#ccb1a5',
      tint: '#2c2521',
      ground: '#161414',
      well: '#0e0c0b',
    },
  },
  vintage: {
    light: {
      accent: '#7b5117',
      tint: '#e9e3dc',
      ground: '#f5f3f1',
      well: '#eae5e0',
    },
    dark: {
      accent: '#d9af7f',
      tint: '#2f2417',
      ground: '#171411',
      well: '#0e0c09',
    },
  },
  fx: {
    light: {
      accent: '#804462',
      tint: '#eae1e5',
      ground: '#f5f2f3',
      well: '#ebe4e7',
    },
    dark: {
      accent: '#dfa3bf',
      tint: '#312128',
      ground: '#181315',
      well: '#0f0b0d',
    },
  },
  // No pack, a pack outside the catalog, or search across every category.
  none: {
    light: {
      accent: '#5b5b5b',
      tint: '#e4e4e4',
      ground: '#f3f3f3',
      well: '#e6e6e6',
    },
    dark: {
      accent: '#b7b7b7',
      tint: '#262626',
      ground: '#151515',
      well: '#0c0c0c',
    },
  },
};
