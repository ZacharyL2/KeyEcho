import { pushActivationKey } from './deeplink';
import { KEYECHO_ORIGIN } from './origin';
import { commands } from './services/bindings';

type Notify = (message: string, tone?: 'default' | 'error') => void;

const NONCE_STORAGE = 'keyecho:buy-nonce';
const CATALOG_URL = `${KEYECHO_ORIGIN}/packs`;
const STATUS_URL = `${KEYECHO_ORIGIN}/packs/purchase-status`;
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_MS = 120_000; // ~2 min, then quietly stop; user can still paste the key

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Stable per-machine nonce: threads app -> browser checkout -> purchase-status.
function machineNonce(): string {
  try {
    const existing = localStorage.getItem(NONCE_STORAGE);
    if (existing) {
      return existing;
    }
  } catch {
    // localStorage unavailable -> fall through to a fresh (non-persistent) nonce.
  }
  const nonce =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    localStorage.setItem(NONCE_STORAGE, nonce);
  } catch {
    // Non-persistent nonce still works for this session's poll.
  }
  return nonce;
}

let polling = false; // ponytail: single poller; the store opens one checkout at a time

async function pollPurchase(nonce: string, notify: Notify) {
  if (polling) {
    return;
  }
  polling = true;
  const deadline = Date.now() + POLL_MAX_MS;
  try {
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
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
      if (data && typeof data.key === 'string' && data.key) {
        notify('Purchase complete — activating your packs.');
        pushActivationKey(data.key); // drives LicenseSetting.check(): list + auto-download
        return;
      }
    }
    // Timeout: quiet stop. The user can still paste their key manually.
  } finally {
    polling = false;
  }
}

// Opens the catalog in the browser with the buy nonce, then polls for the key.
async function openStore(target: string, notify: Notify) {
  const nonce = machineNonce();
  const url = new URL(target);
  url.searchParams.set('buy_nonce', nonce);
  url.searchParams.set('utm_source', 'keyecho_app');

  const result = await commands.openExternalUrl(url.toString());
  if (result.status === 'error') {
    notify(`Couldn't open the store. Reason: ${result.error}`, 'error');
    return;
  }
  void pollPurchase(nonce, notify);
}

export async function startBuyFlow(notify: Notify) {
  await openStore(CATALOG_URL, notify);
}

/** Buy one pack — lands on its own page instead of the whole catalog. */
export async function startPackBuyFlow(slug: string, notify: Notify) {
  await openStore(`${CATALOG_URL}/${encodeURIComponent(slug)}`, notify);
}
