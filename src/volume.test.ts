import { afterEach, expect, test, vi } from 'vitest';

import type { NotifyOptions } from './notify';
import { createVolumeControl } from './volume';

afterEach(() => {
  vi.useRealTimers();
});

// In-memory backend: the stored volume, and whether load or save fail.
function fakeBackend(stored = 0.72) {
  const backend = {
    stored,
    loadFails: false,
    saveFails: false,
    saves: [] as number[],
    toasts: [] as { message: string; options?: NotifyOptions }[],
  };
  const control = createVolumeControl({
    load: async () => {
      if (backend.loadFails) {
        throw new Error('get_volume failed');
      }
      return backend.stored;
    },
    save: async (volume) => {
      backend.saves.push(volume);
      if (backend.saveFails) {
        throw new Error('update_volume failed');
      }
      backend.stored = volume;
    },
    notify: (message, options) => backend.toasts.push({ message, options }),
  });
  return { backend, control };
}

test('shows no volume before the backend has answered', () => {
  const { control } = fakeBackend();

  expect(control.volume()).toBeNull();
  expect(control.adjustable()).toBe(false);
});

test('a failed load leaves the volume unknown and says so', async () => {
  const { backend, control } = fakeBackend();
  backend.loadFails = true;

  await control.refresh();

  expect(control.volume()).toBeNull();
  expect(control.failed()).toBe(true);
  expect(backend.toasts.map((toast) => toast.message)).toEqual([
    "Volume didn't load",
  ]);
});

test('an unknown volume cannot be changed, so nothing is saved', async () => {
  vi.useFakeTimers();
  const { backend, control } = fakeBackend();
  backend.loadFails = true;
  await control.refresh();

  control.change(105);
  await vi.runAllTimersAsync();

  expect(control.volume()).toBeNull();
  expect(backend.saves).toEqual([]);
});

test('retrying the load brings the stored volume back', async () => {
  const { backend, control } = fakeBackend(0.72);
  backend.loadFails = true;
  await control.refresh();

  backend.loadFails = false;
  await control.refresh();

  expect(control.volume()).toBe(72);
  expect(control.failed()).toBe(false);
  expect(control.adjustable()).toBe(true);
});

test('a failed save that cannot reload shows no volume, not the one asked for', async () => {
  vi.useFakeTimers();
  const { backend, control } = fakeBackend(0.72);
  await control.refresh();
  backend.saveFails = true;
  backend.loadFails = true;

  control.change(40);
  await vi.runAllTimersAsync();

  expect(backend.saves).toEqual([0.4]);
  expect(control.volume()).toBeNull();
  expect(backend.toasts.map((toast) => toast.message)).toEqual([
    "Volume didn't change",
    "Volume didn't load",
  ]);
});

test('a known volume is saved once after a burst of changes', async () => {
  vi.useFakeTimers();
  const { backend, control } = fakeBackend(0.72);
  await control.refresh();

  control.change(77);
  control.change(82);
  control.change(200);
  await vi.runAllTimersAsync();

  expect(control.volume()).toBe(150);
  expect(backend.saves).toEqual([1.5]);
});
