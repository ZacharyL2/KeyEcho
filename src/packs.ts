// Same names and order as the site's catalog filter.
export const CATEGORY_LABELS = {
  clicky: 'Clicky',
  thocky: 'Thocky',
  tactile: 'Tactile',
  linear: 'Linear',
  'silent-office': 'Silent office',
  typewriter: 'Typewriter',
  vintage: 'Vintage',
  fx: 'FX',
} as const;

export type CategoryId = keyof typeof CATEGORY_LABELS;

export const CATEGORY_IDS = Object.keys(CATEGORY_LABELS) as CategoryId[];

/** The Packs page shows one word at a time: installed packs or a category. */
export type PackShelf = 'yours' | CategoryId;

export const PACK_SHELVES: readonly PackShelf[] = ['yours', ...CATEGORY_IDS];

export function isCategoryId(value: string | undefined): value is CategoryId {
  return value !== undefined && Object.hasOwn(CATEGORY_LABELS, value);
}

/** Tint key for a pack: its category, or the neutral set. */
export function tintFor(category: string | undefined): CategoryId | 'none' {
  return isCategoryId(category) ? category : 'none';
}

interface Searchable {
  name: string;
  category?: string;
}

/** Search matches pack names and category words, across every category. */
export function searchPacks<T extends Searchable>(
  packs: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return packs.filter((pack) => {
    const label = isCategoryId(pack.category)
      ? CATEGORY_LABELS[pack.category]
      : '';
    return (
      pack.name.toLowerCase().includes(needle) ||
      label.toLowerCase().includes(needle)
    );
  });
}

/** Next or previous shelf, wrapping around. */
export function stepShelf(shelf: PackShelf, delta: number): PackShelf {
  const count = PACK_SHELVES.length;
  const index = PACK_SHELVES.indexOf(shelf);
  return PACK_SHELVES[(index + delta + count) % count];
}

export type GridMove = 'left' | 'right' | 'up' | 'down';

/** Moves a selection through a grid, stopping at the edges. */
export function moveInGrid(
  index: number,
  move: GridMove,
  columns: number,
  count: number,
): number {
  if (count === 0) {
    return -1;
  }
  if (index < 0) {
    return 0;
  }
  const step = {
    left: -1,
    right: 1,
    up: -columns,
    down: columns,
  }[move];
  const next = index + step;
  if (next < 0 || next >= count) {
    return index;
  }
  return next;
}
