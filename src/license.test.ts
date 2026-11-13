import { afterEach, expect, test, vi } from 'vitest';

import {
  browseActionFor,
  forgetVerifiedLicense,
  refreshStoredLicense,
  rememberVerifiedLicense,
  storeLicenseKey,
  verifiedLicense,
} from './license';

const MISSING_PAID = { id: 'creamy-thock-smooth', tier: 'paid' };
const OTHER_PAID = { id: 'crisp-click-bright', tier: 'paid' };

afterEach(() => {
  forgetVerifiedLicense();
  vi.unstubAllGlobals();
});

function stubStoredKey(key: string) {
  const store = new Map([['keyecho:license-key', key]]);
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => store.get(name) ?? null,
    setItem: (name: string, value: string) => store.set(name, value),
    removeItem: (name: string) => store.delete(name),
  });
}

function stubEntitlements(body: unknown, status = 200) {
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) =>
    new Headers(init?.headers).get('Authorization') === 'Bearer KE1.saved'
      ? Response.json(body, { status })
      : Response.json({ valid: false }),
  );
}

function rowAction(pack: { id: string; tier: string }) {
  return browseActionFor(pack, {
    installed: false,
    active: false,
    owned: verifiedLicense()?.packs ?? new Set(),
  });
}

test('a stored key that owns a missing paid pack offers its download, not a rebuy', async () => {
  stubStoredKey('KE1.saved');
  stubEntitlements({ valid: true, packs: [MISSING_PAID.id] });

  await refreshStoredLicense();

  expect(rowAction(MISSING_PAID)).toBe('download-owned');
  expect(verifiedLicense()?.key).toBe('KE1.saved');
  expect(rowAction(OTHER_PAID)).toBe('buy');
});

test('a rejected stored key keeps offering the purchase', async () => {
  stubStoredKey('KE1.saved');
  stubEntitlements({ valid: false });

  await refreshStoredLicense();

  expect(rowAction(MISSING_PAID)).toBe('buy');
});

test('going offline keeps the last verified ownership', async () => {
  stubStoredKey('KE1.saved');
  stubEntitlements({ valid: true, packs: [MISSING_PAID.id] });
  await refreshStoredLicense();

  vi.stubGlobal('fetch', async () => {
    throw new TypeError('network down');
  });
  await refreshStoredLicense();

  expect(rowAction(MISSING_PAID)).toBe('download-owned');
});

function deferredEntitlements() {
  const pending: ((body: unknown) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    () =>
      new Promise<Response>((resolve) => {
        pending.push((body) => resolve(Response.json(body)));
      }),
  );
  return pending;
}

test('a slow refresh for an old key does not replace a newer activation', async () => {
  stubStoredKey('KE1.old');
  const pending = deferredEntitlements();
  const refresh = refreshStoredLicense();

  storeLicenseKey('KE1.new');
  rememberVerifiedLicense('KE1.new', [OTHER_PAID.id]);
  pending[0]!({ valid: true, packs: [MISSING_PAID.id] });
  await refresh;

  expect(verifiedLicense()?.key).toBe('KE1.new');
  expect(rowAction(MISSING_PAID)).toBe('buy');
  expect(rowAction(OTHER_PAID)).toBe('download-owned');
});

test('a slow rejection for an old key keeps a newer activation', async () => {
  stubStoredKey('KE1.old');
  const pending = deferredEntitlements();
  const refresh = refreshStoredLicense();

  storeLicenseKey('KE1.new');
  rememberVerifiedLicense('KE1.new', [OTHER_PAID.id]);
  pending[0]!({ valid: false });
  await refresh;

  expect(verifiedLicense()?.key).toBe('KE1.new');
});

test('a refresh that lands after Forget does not bring the key back', async () => {
  stubStoredKey('KE1.saved');
  const pending = deferredEntitlements();
  const refresh = refreshStoredLicense();

  storeLicenseKey('');
  forgetVerifiedLicense();
  pending[0]!({ valid: true, packs: [MISSING_PAID.id] });
  await refresh;

  expect(verifiedLicense()).toBeNull();
  expect(rowAction(MISSING_PAID)).toBe('buy');
});
