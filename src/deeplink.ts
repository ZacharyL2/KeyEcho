import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { createSignal } from 'solid-js';

import { KEYECHO_ORIGIN } from './origin';

type Notify = (message: string, tone?: 'default' | 'error') => void;

const KEY_ENDPOINT = `${KEYECHO_ORIGIN}/packs/key`;
const PENDING_RETRIES = 5;
const PENDING_DELAY_MS = 1500;

// LicenseSetting subscribes to this; a keyecho://activate deep link pushes the
// fetched license key here, driving the same activation path as manual entry.
const [activationKey, setActivationKey] = createSignal<string | null>(null);
export { activationKey };

// Other activation sources (nonce buy flow) push a fetched key through the same
// signal so LicenseSetting's check() stays the single activation path.
export function pushActivationKey(key: string) {
  const trimmed = key.trim();
  if (trimmed) {
    setActivationKey(trimmed);
  }
}

// keyecho://activate?session=<opaque stripe id> — anything else is ignored.
function parseActivateSession(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'keyecho:' || url.host !== 'activate') {
    return null;
  }
  const session = url.searchParams.get('session')?.trim();
  return session || null;
}

interface Activation {
  key: string;
  packs: string[];
}

async function fetchActivation(
  session: string,
): Promise<Activation | 'pending'> {
  const url = new URL(KEY_ENDPOINT);
  url.searchParams.set('session_id', session); // opaque, untrusted -> URL-encoded here
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`key endpoint returned ${response.status}`);
  }
  const data = (await response.json()) as {
    key?: unknown;
    packs?: unknown;
    pending?: unknown;
  };
  if (data.pending === true) {
    return 'pending';
  }
  if (typeof data.key === 'string' && data.key) {
    return {
      key: data.key,
      packs: Array.isArray(data.packs)
        ? data.packs.filter((pack): pack is string => typeof pack === 'string')
        : [],
    };
  }
  throw new Error('license key endpoint returned an unexpected response');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function activateFromSession(session: string, notify: Notify) {
  for (let attempt = 0; attempt < PENDING_RETRIES; attempt++) {
    let result: Activation | 'pending';
    try {
      result = await fetchActivation(session);
    } catch (error) {
      notify(
        `Activation failed — paste your license key manually. Reason: ${error}`,
        'error',
      );
      return;
    }
    if (result !== 'pending') {
      setActivationKey(result.key);
      const count = result.packs.length;
      notify(`Activated — ${count} pack${count === 1 ? '' : 's'} available.`);
      return;
    }
    await sleep(PENDING_DELAY_MS); // webhook race: the key isn't minted yet
  }
  notify(
    'Your purchase is still processing. Paste your license key manually in a moment.',
    'error',
  );
}

const handled = new Set<string>();

function handleUrls(urls: readonly string[] | null, notify: Notify) {
  if (!urls) {
    return;
  }
  for (const raw of urls) {
    if (handled.has(raw)) {
      continue; // onOpenUrl + getCurrent can both surface the launch URL
    }
    const session = parseActivateSession(raw);
    if (!session) {
      continue;
    }
    handled.add(raw);
    void activateFromSession(session, notify);
  }
}

export async function initDeepLinks(notify: Notify) {
  try {
    await onOpenUrl((urls) => handleUrls(urls, notify));
    handleUrls(await getCurrent(), notify);
  } catch {
    // Deep-link plugin is desktop-only; ignore where it's unavailable.
  }
}
