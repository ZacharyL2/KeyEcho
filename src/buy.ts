import { createSignal } from 'solid-js';

import type { OnlineSound } from './catalog';
import { pushActivationKey } from './deeplink';
import type { Notify } from './notify';
import { KEYECHO_ORIGIN } from './origin';
import { commands } from './services/bindings';

const CATALOG_URL = `${KEYECHO_ORIGIN}/packs`;
const SOUND_TEST_URL = `${KEYECHO_ORIGIN}/keyboard-sound-test`;
const STATUS_URL = `${KEYECHO_ORIGIN}/packs/purchase-status`;
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 120_000; // ~2 min, then say so; the key can still be pasted

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Which checkout is open in the browser and what it buys, so every Buy sheet
 * and bar can show it while waiting.
 */
export type PurchaseTarget =
  | { kind: 'all' }
  | { kind: 'pack'; pack: OnlineSound };

const [pendingPurchase, setPendingPurchase] =
  createSignal<PurchaseTarget | null>(null);
export { pendingPurchase };

/** Stop waiting on the open checkout. */
export function cancelPurchase() {
  setPendingPurchase(null);
}

// Fresh nonce per checkout: threads app -> browser checkout -> purchase-status.
// A reused nonce would resolve to an earlier purchase's key; while a checkout is
// still being polled, reopening the store keeps its nonce.
let pollingNonce: string | null = null;

function checkoutNonce(): string {
  if (pendingPurchase() && pollingNonce) {
    return pollingNonce;
  }
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

async function pollPurchase(
  nonce: string,
  notify: Notify,
  openLicense: () => void,
) {
  // A poll left over from a cancelled checkout must not touch a newer one.
  const isCurrent = () => pendingPurchase() !== null && pollingNonce === nonce;
  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    if (!isCurrent()) {
      return; // cancelled from the dialog
    }
    let data: { key?: unknown; packs?: unknown } | null = null;
    try {
      const url = new URL(STATUS_URL);
      url.searchParams.set('nonce', nonce);
      const response = await fetch(url.toString());
      if (response.ok) {
        data = (await response.json()) as { key?: unknown; packs?: unknown };
      }
    } catch {
      // Transient network error while the user is still checking out; keep polling.
    }
    if (!isCurrent()) {
      return;
    }
    if (data && typeof data.key === 'string' && data.key) {
      setPendingPurchase(null);
      pushActivationKey(data.key); // drives activation: entitlements + download
      return;
    }
  }
  if (!isCurrent()) {
    return;
  }
  setPendingPurchase(null);
  notify('Still waiting · Paste your key', {
    action: { label: 'License', run: openLicense },
  });
}

// Opens the catalog in the browser with the buy nonce, then polls for the key.
async function openStore(
  target: string,
  purchase: PurchaseTarget | null,
  notify: Notify,
  openLicense: () => void,
  campaign: string,
  content?: string,
) {
  const nonce = checkoutNonce();
  const url = new URL(target);
  url.searchParams.set('buy_nonce', nonce);
  url.searchParams.set('utm_source', 'keyecho_app');
  url.searchParams.set('utm_campaign', campaign);
  if (content) url.searchParams.set('utm_content', content);

  const result = await commands.openExternalUrl(url.toString());
  if (result.status === 'error') {
    notify("Couldn't open keyecho.app", {
      tone: 'error',
      details: result.error,
    });
    return;
  }
  if (!purchase || pendingPurchase()) {
    return; // one checkout at a time
  }
  setPendingPurchase(purchase);
  pollingNonce = nonce;
  void pollPurchase(nonce, notify, openLicense);
}

let openingPurchase: Promise<void> | null = null;

async function launchCheckout(
  target: string,
  purchase: PurchaseTarget,
  notify: Notify,
  openLicense: () => void,
  source: { campaign: string; content?: string },
) {
  if (openingPurchase) {
    return openingPurchase;
  }
  // Share the in-flight opener so overlapping clicks cannot split the nonce.
  openingPurchase = openStore(
    target,
    purchase,
    notify,
    openLicense,
    source.campaign,
    source.content,
  );
  try {
    await openingPurchase;
  } finally {
    openingPurchase = null;
  }
}

export async function startBuyFlow(
  notify: Notify,
  openLicense: () => void,
  source: { campaign: string; content?: string } = { campaign: 'browse_offer' },
) {
  await launchCheckout(
    `${CATALOG_URL}#get`,
    { kind: 'all' },
    notify,
    openLicense,
    source,
  );
}

/** One pack: its page on the site, same nonce handoff and polling. */
export async function startPackBuyFlow(
  pack: OnlineSound,
  notify: Notify,
  openLicense: () => void,
  source: { campaign: string; content?: string } = {
    campaign: 'pack_row',
    content: pack.slug,
  },
) {
  await launchCheckout(
    `${CATALOG_URL}/${encodeURIComponent(pack.slug)}#get`,
    { kind: 'pack', pack },
    notify,
    openLicense,
    source,
  );
}

export async function startSoundTestFlow(notify: Notify) {
  await openStore(SOUND_TEST_URL, null, notify, () => {}, 'sound_test');
}
