import { createSignal } from 'solid-js';

export interface StarterCatalogPack {
  id: string;
  tier: string;
  downloadUrl?: string;
}

export interface StarterPackSteps {
  installedNames: () => Promise<string[]>;
  /** Packs in the catalog's own order. */
  loadCatalog: () => Promise<StarterCatalogPack[]>;
  download: (url: string) => Promise<void>;
  select: (packId: string) => Promise<void>;
}

export type StarterPackState = 'idle' | 'installing' | 'failed' | 'done';

/** The first free, downloadable pack in catalog order. */
export function pickStarterPack<T extends StarterCatalogPack>(
  packs: readonly T[],
): T | undefined {
  return packs.find((pack) => pack.tier === 'free' && pack.downloadUrl);
}

/**
 * Installs and selects one free pack when no pack is installed, so a fresh
 * install is audible without a trip to Browse. A failed attempt (offline,
 * catalog or download error) leaves state `failed` and can be run again; a
 * pack that installed but didn't select is selected on the retry.
 */
export function createStarterPackSetup(steps: StarterPackSteps) {
  const [state, setState] = createSignal<StarterPackState>('idle');
  let running: Promise<void> | null = null;
  let pendingSelect: string | null = null;

  const attempt = async () => {
    try {
      if (pendingSelect) {
        await steps.select(pendingSelect);
        pendingSelect = null;
        setState('done');
        return;
      }
      if ((await steps.installedNames()).length > 0) {
        setState('done');
        return;
      }
      setState('installing');
      const pack = pickStarterPack(await steps.loadCatalog());
      if (!pack?.downloadUrl) {
        setState('idle');
        return;
      }
      await steps.download(pack.downloadUrl);
      pendingSelect = pack.id;
      await steps.select(pack.id);
      pendingSelect = null;
      setState('done');
    } catch {
      setState('failed');
    }
  };

  const run = () => {
    if (state() === 'done') {
      return Promise.resolve();
    }
    running ??= attempt().finally(() => {
      running = null;
    });
    return running;
  };

  return { state, run };
}
