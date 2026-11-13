import { describe, expect, it } from 'vitest';

import { CATEGORY_IDS } from './packs';
import { theme } from './theme-contract';
import { categoryColors, darkTheme, lightTheme } from './theme-tokens';

const keys = (value: object) => Object.keys(value).toSorted();

describe('theme tokens', () => {
  it('fill every contract slot in light and dark', () => {
    for (const values of [lightTheme, darkTheme]) {
      expect(keys(values.color)).toEqual(keys(theme.color));
      expect(keys(values.shadow)).toEqual(keys(theme.shadow));
      expect(keys(values.font)).toEqual(keys(theme.font));
      expect(keys(values.radius)).toEqual(keys(theme.radius));
    }
  });

  it('give each of the eight categories, and the neutral set, both looks', () => {
    expect(keys(categoryColors)).toEqual([...CATEGORY_IDS, 'none'].toSorted());
    for (const colors of Object.values(categoryColors)) {
      for (const look of [colors.light, colors.dark]) {
        expect(keys(look)).toEqual(keys(theme.category));
        for (const value of Object.values(look)) {
          expect(value).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it('keep the CSS variable names readable', () => {
    expect(theme.color.ink).toBe('var(--ink)');
    expect(theme.category.accent).toBe('var(--accent)');
  });
});
