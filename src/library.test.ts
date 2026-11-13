import { afterEach, expect, test, vi } from 'vitest';

import type { NotifyOptions } from './notify';

const backend = {
  installed: ['creamy-thock-smooth'],
  failing: new Set<string>(),
  downloads: [] as string[],
};

vi.mock('./services/bindings', () => ({
  commands: {
    getSounds: async () => ({
      status: 'ok',
      data: backend.installed.map((name) => ({ name, value: `/p/${name}` })),
    }),
    downloadSound: async (url: string) => {
      const id = new URL(url).searchParams.get('pack') ?? url;
      backend.downloads.push(id);
      return backend.failing.has(id)
        ? { status: 'error', error: `${id} failed` }
        : { status: 'ok', data: null };
    },
  },
}));

vi.mock('./license', async (original) => ({
  ...(await original<typeof import('./license')>()),
  fetchEntitledPacks: async () => [
    'creamy-thock-smooth',
    'crisp-click-bright',
    'newsroom-typewriter',
    'retro-enter',
  ],
  storeLicenseKey: () => {},
  rememberVerifiedLicense: () => {},
}));

afterEach(() => {
  backend.failing.clear();
  backend.downloads.length = 0;
  vi.unstubAllGlobals();
});

test('installed packs load while keyecho.app has not answered', async () => {
  vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
  const { loadSounds } = await import('./library');

  const loaded = await Promise.race([
    loadSounds(),
    new Promise<'waiting'>((done) => setTimeout(done, 500, 'waiting')),
  ]);

  expect(loaded).not.toBe('waiting');
  expect(loaded).toEqual([
    expect.objectContaining({ name: 'creamy-thock-smooth' }),
  ]);
});

test('every download failing on activation says so once, and Retry tries those again', async () => {
  vi.stubGlobal('fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  const { activateLicense } = await import('./library');
  const toasts: { message: string; options?: NotifyOptions }[] = [];
  const notify = (message: string, options?: NotifyOptions) =>
    toasts.push({ message, options });
  backend.failing = new Set([
    'crisp-click-bright',
    'newsroom-typewriter',
    'retro-enter',
  ]);

  await activateLicense('KE1.key', notify);

  expect(toasts.map((toast) => toast.message)).toEqual([
    "3 packs didn't download",
  ]);
  expect(toasts[0].options?.details?.split('\n')).toHaveLength(3);

  backend.failing.delete('retro-enter');
  backend.downloads.length = 0;
  toasts[0].options?.action?.run();
  await vi.waitFor(() => expect(toasts).toHaveLength(2));

  expect(backend.downloads).toEqual([
    'crisp-click-bright',
    'newsroom-typewriter',
    'retro-enter',
  ]);
  expect(toasts[1].message).toBe("2 packs didn't download");
});
