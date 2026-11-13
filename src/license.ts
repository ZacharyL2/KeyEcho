import { createSignal } from 'solid-js';
import { array, boolean, object, optional, parseAsync, string } from 'valibot';

import { KEYECHO_ORIGIN } from './origin';

const LICENSE_KEY_STORAGE = 'keyecho:license-key';
const ENTITLEMENTS_URL = `${KEYECHO_ORIGIN}/packs/entitlements`;
const PACK_DOWNLOAD_URL = `${KEYECHO_ORIGIN}/packs/download`;

const EntitlementsSchema = object({
  valid: boolean(),
  packs: optional(array(string())),
});

export function loadStoredLicenseKey(): string {
  try {
    return localStorage.getItem(LICENSE_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function storeLicenseKey(key: string) {
  try {
    if (key) {
      localStorage.setItem(LICENSE_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(LICENSE_KEY_STORAGE);
    }
  } catch {
    // A missing persisted key only means the user re-pastes it next launch.
  }
}

export function packDownloadUrl(packId: string): string {
  const url = new URL(PACK_DOWNLOAD_URL);
  url.searchParams.set('pack', packId);
  return url.toString();
}

export async function fetchEntitledPacks(key: string): Promise<string[]> {
  const response = await fetch(ENTITLEMENTS_URL, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    throw new Error(`${ENTITLEMENTS_URL} returned ${response.status}`);
  }
  const data = await parseAsync(EntitlementsSchema, await response.json());
  if (!data.valid) {
    throw new Error('invalid-key');
  }
  return data.packs ?? [];
}

/** Packs a key was last verified for, shared by License and Browse. */
export interface VerifiedLicense {
  key: string;
  packs: ReadonlySet<string>;
}

const [verifiedLicense, setVerifiedLicense] =
  createSignal<VerifiedLicense | null>(null);
export { verifiedLicense };

// Bumped on every activation or forget so a slower refresh can't undo it.
let licenseGeneration = 0;

export function rememberVerifiedLicense(key: string, packs: string[]) {
  licenseGeneration += 1;
  setVerifiedLicense({ key, packs: new Set(packs) });
}

export function forgetVerifiedLicense() {
  licenseGeneration += 1;
  setVerifiedLicense(null);
}

/**
 * Re-checks the saved key so Browse knows what is already paid for. Offline
 * keeps the last answer; a rejected key drops it.
 */
export async function refreshStoredLicense(): Promise<void> {
  const key = loadStoredLicenseKey().trim();
  if (!key) {
    forgetVerifiedLicense();
    return;
  }
  const generation = licenseGeneration;
  const superseded = () =>
    generation !== licenseGeneration || loadStoredLicenseKey().trim() !== key;
  try {
    const packs = await fetchEntitledPacks(key);
    if (!superseded()) {
      rememberVerifiedLicense(key, packs);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'invalid-key' &&
      !superseded()
    ) {
      forgetVerifiedLicense();
    }
  }
}

export type BrowseAction =
  | 'in-use'
  | 'use'
  | 'download'
  | 'download-owned'
  | 'buy';

/** What a Browse row offers: owned paid packs download, never rebuy. */
export function browseActionFor(
  pack: { id: string; tier: string },
  state: { installed: boolean; active: boolean; owned: ReadonlySet<string> },
): BrowseAction {
  if (state.installed) {
    return state.active ? 'in-use' : 'use';
  }
  if (pack.tier === 'free') {
    return 'download';
  }
  return state.owned.has(pack.id) ? 'download-owned' : 'buy';
}
