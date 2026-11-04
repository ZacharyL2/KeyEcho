import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

const opened = vi.hoisted((): string[] => []);
vi.mock('./services/bindings', () => ({
  commands: {
    openExternalUrl: async (url: string) => {
      opened.push(url);
      return { status: 'ok', data: null };
    },
  },
}));
vi.mock('@tauri-apps/plugin-deep-link', () => ({
  getCurrent: async () => null,
  onOpenUrl: async () => () => {},
}));

const { cancelPurchase, pendingPurchase, startBuyFlow } = await import('./buy');
const { activationKey } = await import('./deeplink');

afterEach(() => {
  cancelPurchase();
  opened.length = 0;
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
