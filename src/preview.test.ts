import { afterEach, expect, test, vi } from 'vitest';

const calls: string[] = [];
vi.mock('./services/bindings', () => ({
  commands: {
    previewCatalogPack: async (id: string) => {
      calls.push(`preview ${id}`);
      return { status: 'ok', data: null };
    },
    stopPreview: async () => {
      calls.push('stop');
      return { status: 'ok', data: null };
    },
  },
}));

afterEach(() => {
  calls.length = 0;
  vi.unstubAllGlobals();
});

test('a second press on the playing pack stops it', async () => {
  vi.stubGlobal('window', { setTimeout });
  const { createPreview } = await import('./preview');
  const preview = createPreview();

  await preview.preview('big-key-thock');
  expect(preview.playingId()).toBe('big-key-thock');

  await preview.preview('big-key-thock');
  expect(calls).toEqual(['preview big-key-thock', 'stop']);
  expect(preview.playingId()).toBeNull();
});

test('a press on another pack plays that one', async () => {
  vi.stubGlobal('window', { setTimeout });
  const { createPreview } = await import('./preview');
  const preview = createPreview();

  await preview.preview('big-key-thock');
  await preview.preview('retro-enter');
  expect(calls).toEqual(['preview big-key-thock', 'preview retro-enter']);
  expect(preview.playingId()).toBe('retro-enter');
});
