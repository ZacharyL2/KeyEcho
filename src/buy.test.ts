import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

const opened = vi.hoisted((): string[] => []);
const openExternalUrl = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: 'ok', data: null }),
);
vi.mock('./services/bindings', () => ({
  commands: {
    openExternalUrl: async (url: string) => {
      opened.push(url);
      return openExternalUrl();
    },
  },
}));
vi.mock('@tauri-apps/plugin-deep-link', () => ({
  getCurrent: async () => null,
  onOpenUrl: async () => () => {},
}));

const { cancelPurchase, pendingPurchase, startBuyFlow, startPackBuyFlow } =
  await import('./buy');
const { activationKey } = await import('./deeplink');

afterEach(() => {
  cancelPurchase();
  opened.length = 0;
  openExternalUrl.mockReset().mockResolvedValue({ status: 'ok', data: null });
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// purchase-status answers with a key only for the given nonce.
function stubStatusPaidFor(paidNonce: () => string | null, key: string) {
  vi.stubGlobal('fetch', async (url: string) =>
    new URL(url).searchParams.get('nonce') === paidNonce()
      ? Response.json({ key, packs: [] })
      : Response.json({ pending: true }),
  );
}

function openedNonce(index: number): string | null {
  const url = opened[index];
  return url ? new URL(url).searchParams.get('buy_nonce') : null;
}

test('overlapping checkout launches open only one checkout and activate its paid key', async () => {
  vi.useFakeTimers();
  let resolveOpen!: (result: { status: 'ok'; data: null }) => void;
  openExternalUrl.mockImplementationOnce(
    () => new Promise((resolve) => (resolveOpen = resolve)),
  );
  stubStatusPaidFor(() => openedNonce(0), 'KEY-FROM-OVERLAPPING-CHECKOUT');

  const first = startBuyFlow(
    () => {},
    () => {},
  );
  const second = startBuyFlow(
    () => {},
    () => {},
  );
  resolveOpen({ status: 'ok', data: null });
  await Promise.all([first, second]);
  await vi.advanceTimersByTimeAsync(2000);

  assert.equal(opened.length, 1);
  assert.ok(openedNonce(0));
  assert.equal(activationKey(), 'KEY-FROM-OVERLAPPING-CHECKOUT');
  assert.equal(pendingPurchase(), null);
});

test('a failed browser opener allows a fresh checkout launch', async () => {
  openExternalUrl.mockResolvedValueOnce({
    status: 'error',
    error: 'unavailable',
  });
  const notices: string[] = [];
  await startBuyFlow(
    (message) => void notices.push(message),
    () => {},
  );
  assert.equal(pendingPurchase(), null);
  assert.deepEqual(notices, ["Couldn't open keyecho.app"]);

  await startBuyFlow(
    () => {},
    () => {},
  );
  assert.equal(opened.length, 2);
  assert.notEqual(openedNonce(0), openedNonce(1));
  assert.deepEqual(pendingPurchase(), { kind: 'all' });
});

test('a rejected browser opener does not block the next checkout launch', async () => {
  openExternalUrl.mockRejectedValueOnce(new Error('opener disconnected'));
  await assert.rejects(
    startBuyFlow(
      () => {},
      () => {},
    ),
    /opener disconnected/,
  );
  assert.equal(pendingPurchase(), null);

  await startBuyFlow(
    () => {},
    () => {},
  );
  assert.equal(opened.length, 2);
  assert.notEqual(openedNonce(0), openedNonce(1));
  assert.deepEqual(pendingPurchase(), { kind: 'all' });
});

test('a single-pack checkout opens the pack page and activates the key it paid for', async () => {
  vi.useFakeTimers();
  stubStatusPaidFor(() => openedNonce(0), 'KEY-FOR-ONE-PACK');

  const typewriter = {
    id: 'newsroom-typewriter',
    name: 'Newsroom Typewriter',
    slug: 'newsroom-typewriter',
    tier: 'paid',
    priceUsd: 3.99,
  };
  await startPackBuyFlow(
    typewriter,
    () => {},
    () => {},
  );
  const url = new URL(opened[0]);
  assert.equal(url.pathname, '/packs/newsroom-typewriter');
  assert.equal(url.hash, '#get');
  assert.equal(url.searchParams.get('utm_campaign'), 'pack_row');
  assert.equal(url.searchParams.get('utm_content'), 'newsroom-typewriter');
  assert.ok(openedNonce(0));
  assert.deepEqual(pendingPurchase(), { kind: 'pack', pack: typewriter });

  await vi.advanceTimersByTimeAsync(2000);
  assert.equal(activationKey(), 'KEY-FOR-ONE-PACK');
  assert.equal(pendingPurchase(), null);
});

test('each in-app checkout carries its own purchase nonce', async () => {
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
  });
  vi.stubGlobal('fetch', async () => Response.json({ pending: true }));

  await startBuyFlow(
    () => {},
    () => {},
  );
  cancelPurchase();
  await startBuyFlow(
    () => {},
    () => {},
  );

  const [first, second] = opened.map((url) =>
    new URL(url).searchParams.get('buy_nonce'),
  );
  assert.ok(first);
  assert.notEqual(second, first);
});

test('reopening the store while a checkout is polled keeps the polled nonce', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ pending: true }));

  await startBuyFlow(
    () => {},
    () => {},
  );
  await startBuyFlow(
    () => {},
    () => {},
  );

  const [first, second] = opened.map((url) =>
    new URL(url).searchParams.get('buy_nonce'),
  );
  assert.ok(first);
  assert.equal(second, first);
});

test('a cancelled checkout that completes later does not activate over the new checkout', async () => {
  vi.useFakeTimers();
  stubStatusPaidFor(() => openedNonce(0), 'KEY-FROM-CANCELLED');

  await startBuyFlow(
    () => {},
    () => {},
  );
  cancelPurchase();
  await startBuyFlow(
    () => {},
    () => {},
  );
  await vi.advanceTimersByTimeAsync(10_000);

  assert.notEqual(activationKey(), 'KEY-FROM-CANCELLED');
  assert.deepEqual(pendingPurchase(), { kind: 'all' });
});

test('a cancelled checkout timing out does not end the new checkout', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', async () => Response.json({ pending: true }));
  const notices: string[] = [];

  await startBuyFlow(
    (message) => void notices.push(message),
    () => {},
  );
  await vi.advanceTimersByTimeAsync(100_000);
  cancelPurchase();
  await startBuyFlow(
    (message) => void notices.push(message),
    () => {},
  );
  await vi.advanceTimersByTimeAsync(30_000);

  assert.deepEqual(pendingPurchase(), { kind: 'all' });
  assert.deepEqual(notices, []);
});
