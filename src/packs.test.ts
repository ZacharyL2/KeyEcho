import { describe, expect, it } from 'vitest';

import { moveInGrid, searchPacks, stepShelf, tintFor } from './packs';

const packs = [
  { name: 'Creamy Thock', category: 'thocky' },
  { name: 'Crisp Click', category: 'clicky' },
  { name: 'Newsroom Typewriter', category: 'typewriter' },
  { name: 'Local Pack' },
];

describe('pack shelves', () => {
  it('searches names and category words across every category', () => {
    expect(searchPacks(packs, 'thock').map((p) => p.name)).toEqual([
      'Creamy Thock',
    ]);
    expect(searchPacks(packs, 'TYPEWRITER').map((p) => p.name)).toEqual([
      'Newsroom Typewriter',
    ]);
    expect(searchPacks(packs, '  ')).toEqual([]);
  });

  it('cycles from Yours through the eight words and back', () => {
    expect(stepShelf('yours', 1)).toBe('clicky');
    expect(stepShelf('fx', 1)).toBe('yours');
    expect(stepShelf('yours', -1)).toBe('fx');
  });

  it('moves through a three-column grid and stops at the edges', () => {
    expect(moveInGrid(-1, 'right', 3, 5)).toBe(0);
    expect(moveInGrid(0, 'left', 3, 5)).toBe(0);
    expect(moveInGrid(1, 'down', 3, 5)).toBe(4);
    expect(moveInGrid(2, 'down', 3, 5)).toBe(2);
    expect(moveInGrid(4, 'up', 3, 5)).toBe(1);
    expect(moveInGrid(0, 'down', 3, 0)).toBe(-1);
  });

  it('tints unknown categories with the neutral set', () => {
    expect(tintFor('linear')).toBe('linear');
    expect(tintFor(undefined)).toBe('none');
    expect(tintFor('constructor')).toBe('none');
  });
});
