import type { InferOutput } from 'valibot';
import {
  array,
  literal,
  number,
  object,
  optional,
  parseAsync,
  pipe,
  record,
  safeParse,
  string,
  url,
} from 'valibot';

import { setServedOffer } from './offer';
import { KEYECHO_ORIGIN } from './origin';

// v1.1: schemaVersion-2 catalog (free + paid). No GitHub fallback.
const PACK_CATALOG_URL = `${KEYECHO_ORIGIN}/packs/catalog.json`;

// Featured paid packs, most popular first.
const FEATURED_PAID = [
  'creamy-thock-smooth',
  'crisp-click-bright',
  'lecture-hall-laptop',
  'newsroom-typewriter',
  'arcade-key-blips',
];

const PackCatalogSchema = object({
  schemaVersion: literal(2),
  offer: optional(
    object({
      name: string(),
      code: string(),
      priceUsd: number(),
      endsAt: string(),
    }),
  ),
  packs: array(
    object({
      id: string(),
      name: string(),
      slug: string(),
      tier: string(),
      priceUsd: number(),
      category: optional(string()),
      tagline: optional(string()),
      downloadUrl: optional(pipe(string(), url())),
    }),
  ),
});

export type PackCatalog = InferOutput<typeof PackCatalogSchema>;

export interface OnlineSound {
  downloadUrl?: string; // free packs only; paid ones are bought on the web
  id: string;
  name: string;
  slug: string;
  tier: string;
  priceUsd: number;
  category?: string;
  tagline?: string;
}

// Pack lists are remote and grow over time, so display names come from token
// rules rather than a per-pack map: brand tokens that don't title-case cleanly
// are listed here, everything else is title-cased as-is.
const SOUND_NAME_TOKENS: Record<string, string> = {
  abs: 'ABS',
  cherrymx: 'Cherry MX',
  eg: 'EG',
  nk: 'NK',
  pbt: 'PBT',
};

export function displaySoundName(rawName: string): string {
  return rawName
    .replace(/\.tar$/, '')
    .replace(/^waveapp-/, '') // catalog packIds carry a vendor prefix
    .split('-')
    .map(
      (word) =>
        SOUND_NAME_TOKENS[word] ??
        (word ? word[0].toUpperCase() + word.slice(1) : word),
    )
    .join(' ');
}

async function fetchJson(address: string): Promise<unknown> {
  const response = await fetch(address);
  if (!response.ok) {
    throw new Error(`${address} returned ${response.status}`);
  }
  return response.json();
}

export async function loadPackCatalog(): Promise<PackCatalog> {
  return parseAsync(PackCatalogSchema, await fetchJson(PACK_CATALOG_URL));
}

function rank(pack: { slug: string }): number {
  const index = FEATURED_PAID.indexOf(pack.slug);
  return index === -1 ? FEATURED_PAID.length : index;
}

export function sortPacks(packs: readonly OnlineSound[]): OnlineSound[] {
  // Crafted packs lead, most-auditioned first; free packs follow. Rest alphabetical.
  return packs.toSorted((a, b) => {
    const aFree = a.tier === 'free' ? 1 : 0;
    const bFree = b.tier === 'free' ? 1 : 0;
    return aFree - bFree || rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

// Installed packs are folders named by slug (crisp-click-bright), but the store
// sells them under a shorter marketing name (Crisp Click). Resolve through the
// catalog so both surfaces agree.
let catalogNameCache: Map<string, string> | null = null;

// The last catalog's names, so installed packs keep them while offline.
const PACK_NAMES_STORAGE = 'keyecho:pack-names';

function storedPackNames(): Map<string, string> {
  try {
    const parsed = safeParse(
      record(string(), string()),
      JSON.parse(localStorage.getItem(PACK_NAMES_STORAGE) ?? '{}'),
    );
    return new Map(parsed.success ? Object.entries(parsed.output) : []);
  } catch {
    return new Map();
  }
}

function storePackNames(names: Map<string, string>) {
  try {
    localStorage.setItem(
      PACK_NAMES_STORAGE,
      JSON.stringify(Object.fromEntries(names)),
    );
  } catch {
    // Without them, offline names fall back to the folder names.
  }
}

/** Every catalog pack, in the catalog's own order. */
export async function loadOnlineSounds(): Promise<OnlineSound[]> {
  const catalog = await loadPackCatalog();
  catalogNameCache = new Map(catalog.packs.map((pack) => [pack.id, pack.name]));
  storePackNames(catalogNameCache);
  setServedOffer(catalog.offer);
  return catalog.packs;
}

/** Display name for a pack id, usable outside async context. */
export function packLabel(id: string): string {
  return (
    (catalogNameCache ?? storedPackNames()).get(id) ?? displaySoundName(id)
  );
}

/** The catalog entry an installed pack folder came from. */
export function catalogPackFor(
  online: readonly OnlineSound[],
  installedName: string,
): OnlineSound | undefined {
  return (
    online.find((pack) => pack.id === installedName) ??
    online.find((pack) => pack.id.startsWith(installedName))
  );
}

/** Pack counts for offers and the Packs page, taken from the live catalog. */
export interface CatalogCounts {
  total: number;
  free: number;
  paid: number;
}

export function catalogCounts(online: readonly OnlineSound[]): CatalogCounts {
  const paid = online.filter((pack) => pack.tier !== 'free').length;
  return { total: online.length, free: online.length - paid, paid };
}

/** True once the verified key owns every paid pack in the catalog. */
export function ownsEveryPaid(
  online: readonly OnlineSound[],
  owned: ReadonlySet<string>,
): boolean {
  const paid = online.filter((pack) => pack.tier !== 'free');
  return paid.length > 0 && paid.every((pack) => owned.has(pack.id));
}
