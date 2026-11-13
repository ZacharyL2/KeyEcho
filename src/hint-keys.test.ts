import { describe, expect, it } from 'vitest';

import type { OnlineSound } from './catalog';
import { firstLaunchHintKeys, homeHintKeys, packsHintKeys } from './hint-keys';
import type { PackCard } from './pack-cards';

const keysOf = (hints: readonly (readonly [string, string])[]) =>
  hints.map(([key, label]) => `${key} ${label}`);

const online: OnlineSound = {
  id: 'big-key-thock',
  name: 'Big Key Thock',
  slug: 'big-key-thock',
  tier: 'paid',
  priceUsd: 3.99,
  category: 'thocky',
};
const card = (action: PackCard['action'], withOnline = true): PackCard => ({
  key: online.id,
  name: online.name,
  online: withOnline ? online : undefined,
  action,
});

describe('packs hint row', () => {
  it('offers no space or enter while no card is selected', () => {
    // Empty search, Yours empty, offline: nothing to act on.
    expect(keysOf(packsHintKeys(undefined, 0, false))).toEqual([
      'tab character',
    ]);
    expect(keysOf(packsHintKeys(undefined, 3, false))).toEqual([
      'tab character',
      '← → ↑ ↓ move',
    ]);
  });

  it('names the selected card action, including packs the key owns', () => {
    expect(keysOf(packsHintKeys(card('buy'), 3, false))).toContain('enter get');
    expect(keysOf(packsHintKeys(card('download-owned'), 3, false))).toContain(
      'enter download',
    );
    expect(keysOf(packsHintKeys(card('download'), 3, false))).toContain(
      'enter download',
    );
    expect(keysOf(packsHintKeys(card('use'), 3, false))).toContain('enter use');
  });

  it('drops enter where it does nothing', () => {
    const inUse = keysOf(packsHintKeys(card('in-use'), 3, false));
    expect(inUse.some((hint) => hint.startsWith('enter'))).toBe(false);
    const busy = keysOf(packsHintKeys(card('download'), 3, true));
    expect(busy.some((hint) => hint.startsWith('enter'))).toBe(false);
  });

  it('offers preview only on a card the catalog knows', () => {
    // Offline, Yours cards have no catalog entry to preview.
    expect(keysOf(packsHintKeys(card('use', false), 3, false))).toEqual([
      'tab character',
      '← → ↑ ↓ move',
      'enter use',
    ]);
  });
});

describe('first launch hint row', () => {
  it('offers no preview or enter when no pack is shown', () => {
    // Offline or an empty catalog.
    expect(keysOf(firstLaunchHintKeys(null))).toEqual(['← → character']);
  });

  it('names what enter does, and drops it while the pack cannot act', () => {
    expect(keysOf(firstLaunchHintKeys('get'))).toEqual([
      '← → character',
      'space preview',
      'enter get',
    ]);
    expect(keysOf(firstLaunchHintKeys('download'))).toContain('enter download');
    for (const action of ['saving', 'busy'] as const) {
      expect(keysOf(firstLaunchHintKeys(action))).toEqual([
        '← → character',
        'space preview',
      ]);
    }
  });
});

describe('space while a preview plays', () => {
  it('says stop on Packs for the selected card that is playing', () => {
    expect(keysOf(packsHintKeys(card('buy'), 3, false, true))).toContain(
      'space stop',
    );
    expect(keysOf(packsHintKeys(card('buy'), 3, false, false))).toContain(
      'space preview',
    );
  });

  it('says stop on first launch for the pack shown that is playing', () => {
    expect(keysOf(firstLaunchHintKeys('download', true))).toContain(
      'space stop',
    );
  });
});

describe('home hint row', () => {
  it('offers pack stepping only with packs installed', () => {
    expect(keysOf(homeHintKeys(false, true))).toEqual([
      '↑ ↓ volume',
      '/ find a pack',
    ]);
    expect(keysOf(homeHintKeys(true, true))[0]).toBe('← → pack');
  });

  it('offers volume keys only while the volume is known', () => {
    expect(keysOf(homeHintKeys(true, false))).toEqual([
      '← → pack',
      '/ find a pack',
    ]);
  });
});
