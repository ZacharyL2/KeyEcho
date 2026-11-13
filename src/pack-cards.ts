import type { OnlineSound } from './catalog';
import { catalogPackFor } from './catalog';
import type { InstalledSound } from './library';
import type { BrowseAction } from './license';
import { browseActionFor } from './license';
import type { PackShelf } from './packs';
import { searchPacks } from './packs';

export const GRID_COLUMNS = 3;

/** One card on the Packs page: a catalog pack, an installed one, or both. */
export interface PackCard {
  key: string;
  name: string;
  category?: string;
  online?: OnlineSound;
  installed?: InstalledSound;
  action: BrowseAction;
}

export function buildCards(input: {
  shelf: PackShelf;
  query: string;
  online: readonly OnlineSound[];
  installed: readonly InstalledSound[];
  activeValue: string | undefined;
  owned: ReadonlySet<string>;
}): PackCard[] {
  const installedFor = (pack: OnlineSound) =>
    input.installed.find((item) => pack.id.startsWith(item.name));
  const fromOnline = (pack: OnlineSound): PackCard => {
    const installed = installedFor(pack);
    return {
      key: pack.id,
      name: pack.name,
      category: pack.category,
      online: pack,
      installed,
      action: browseActionFor(pack, {
        installed: installed !== undefined,
        active:
          installed !== undefined && installed.value === input.activeValue,
        owned: input.owned,
      }),
    };
  };

  if (input.query.trim()) {
    return searchPacks(input.online, input.query).map(fromOnline);
  }
  if (input.shelf === 'yours') {
    return input.installed.map((sound) => {
      const online = catalogPackFor(input.online, sound.name);
      return {
        key: sound.value,
        name: online?.name ?? sound.label,
        category: online?.category,
        online,
        installed: sound,
        action: sound.value === input.activeValue ? 'in-use' : 'use',
      };
    });
  }
  return input.online
    .filter((pack) => pack.category === input.shelf)
    .map(fromOnline);
}
