import type { FirstLaunchAction } from './first-launch';
import type { BrowseAction } from './license';
import type { PackCard } from './pack-cards';

/** One hint in the row at the bottom of the window: key, then what it does. */
export type HintKey = readonly [key: string, label: string];

// What enter does on a card; null where it does nothing.
const ENTER_LABEL: Record<BrowseAction, string | null> = {
  'in-use': null,
  use: 'use',
  download: 'download',
  'download-owned': 'download',
  buy: 'get',
};

/**
 * Home: ← → steps through installed packs, so it needs at least one; ↑ ↓ steps
 * from the current volume, so it needs a known one.
 */
export function homeHintKeys(
  hasSounds: boolean,
  volumeKnown: boolean,
): HintKey[] {
  return [
    ...(hasSounds ? [['← →', 'pack'] as const] : []),
    ...(volumeKnown ? [['↑ ↓', 'volume'] as const] : []),
    ['/', 'find a pack'],
  ];
}

/**
 * First launch: space previews the pack shown (or stops its preview), enter
 * runs its action if it can.
 */
export function firstLaunchHintKeys(
  action: FirstLaunchAction | null,
  playing = false,
): HintKey[] {
  const keys: HintKey[] = [['← →', 'character']];
  if (action) {
    keys.push(['space', playing ? 'stop' : 'preview']);
    if (action === 'download' || action === 'get') {
      keys.push(['enter', action]);
    }
  }
  return keys;
}

/**
 * Packs: space and enter act on the selected card only, and enter names that
 * card's own action. A download is ignored while another one runs. Space
 * stops the selected card's preview while it plays.
 */
export function packsHintKeys(
  selected: PackCard | undefined,
  cardCount: number,
  downloading: boolean,
  playing = false,
): HintKey[] {
  const keys: HintKey[] = [['tab', 'character']];
  if (cardCount > 0) {
    keys.push(['← → ↑ ↓', 'move']);
  }
  if (selected?.online) {
    keys.push(['space', playing ? 'stop' : 'preview']);
  }
  const enter = selected ? ENTER_LABEL[selected.action] : null;
  const isDownload =
    selected?.action === 'download' || selected?.action === 'download-owned';
  if (enter && !(downloading && isDownload)) {
    keys.push(['enter', enter]);
  }
  return keys;
}
