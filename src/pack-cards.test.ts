import { describe, expect, it } from 'vitest';

import type { OnlineSound } from './catalog';
import { catalogCounts, catalogPackFor, ownsEveryPaid } from './catalog';
import { buildCards } from './pack-cards';

const pack = (
  id: string,
  category: string,
  tier: 'free' | 'paid',
): OnlineSound => ({
  id,
  name: id.replaceAll('-', ' '),
  slug: id,
  tier,
  priceUsd: tier === 'free' ? 0 : 3.99,
  category,
  downloadUrl:
    tier === 'free' ? `https://cdn.keyecho.app/packs/${id}.tar` : undefined,
});

const online = [
  pack('creamy-thock', 'thocky', 'paid'),
  pack('deep-thock', 'thocky', 'free'),
  pack('crisp-click', 'clicky', 'paid'),
  pack('newsroom-typewriter', 'typewriter', 'paid'),
];
const installed = [
  { name: 'creamy-thock', value: '/p/creamy-thock', label: 'Creamy Thock' },
  { name: 'my-own-pack', value: '/p/my-own-pack', label: 'My Own Pack' },
];
const base = {
  online,
  installed,
  activeValue: '/p/creamy-thock',
  owned: new Set(['crisp-click']),
  query: '',
};

describe('pack cards', () => {
  it('shows one character with the action each pack offers', () => {
    const cards = buildCards({ ...base, shelf: 'thocky' });
    expect(cards.map((card) => [card.key, card.action])).toEqual([
      ['creamy-thock', 'in-use'],
      ['deep-thock', 'download'],
    ]);
    expect(
      buildCards({ ...base, shelf: 'clicky' }).map((card) => card.action),
    ).toEqual(['download-owned']);
    expect(
      buildCards({ ...base, shelf: 'typewriter' }).map((card) => card.action),
    ).toEqual(['buy']);
  });

  it('lists installed packs under Yours, catalog or not', () => {
    const cards = buildCards({ ...base, shelf: 'yours' });
    expect(
      cards.map((card) => [card.name, card.action, card.category]),
    ).toEqual([
      ['creamy thock', 'in-use', 'thocky'],
      ['My Own Pack', 'use', undefined],
    ]);
  });

  it('searches every character, whatever word is picked', () => {
    const cards = buildCards({ ...base, shelf: 'clicky', query: 'thock' });
    expect(cards.map((card) => card.key)).toEqual([
      'creamy-thock',
      'deep-thock',
    ]);
  });
});

describe('catalog helpers', () => {
  it('counts free and paid packs', () => {
    expect(catalogCounts(online)).toEqual({ total: 4, free: 1, paid: 3 });
  });

  it('matches an installed folder to its catalog pack', () => {
    expect(catalogPackFor(online, 'deep-thock')?.category).toBe('thocky');
    expect(catalogPackFor(online, 'nothing-like-it')).toBeUndefined();
  });

  it('treats a key as All Sounds only when it owns every paid pack', () => {
    expect(ownsEveryPaid(online, new Set(['crisp-click']))).toBe(false);
    expect(
      ownsEveryPaid(
        online,
        new Set(['creamy-thock', 'crisp-click', 'newsroom-typewriter']),
      ),
    ).toBe(true);
    expect(ownsEveryPaid([], new Set())).toBe(false);
  });
});
