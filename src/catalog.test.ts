import { afterEach, expect, it, vi } from 'vitest';

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

const catalog = {
  schemaVersion: 2,
  packs: [
    {
      id: 'creamy-thock-smooth',
      name: 'Creamy Thock',
      slug: 'creamy-thock-smooth',
      tier: 'paid',
      priceUsd: 3.99,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('keeps catalog pack names for a later launch without network', async () => {
  vi.stubGlobal('localStorage', memoryStorage());

  vi.stubGlobal('fetch', async () => Response.json(catalog));
  await (await import('./catalog')).loadOnlineSounds();

  // Next launch, offline.
  vi.resetModules();
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  const offline = await import('./catalog');
  expect(offline.packLabel('creamy-thock-smooth')).toBe('Creamy Thock');
  // A pack the catalog never named still gets its folder name.
  expect(offline.packLabel('my-office-board')).toBe('My Office Board');
});
