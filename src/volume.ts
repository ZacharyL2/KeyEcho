import { createSignal } from 'solid-js';

import type { Notify } from './notify';

// Matches the backend clamp: past 150% the loudest pack clips.
export const MAX_VOLUME = 150;

export interface VolumeSteps {
  /** The backend's volume, 1 = 100%. */
  load: () => Promise<number>;
  save: (volume: number) => Promise<void>;
  notify: Notify;
}

/**
 * The volume as the backend has it. It is null while the app does not know it
 * (still loading, or the load failed); then nothing can change it, since a
 * step needs a value to step from.
 */
export function createVolumeControl(steps: VolumeSteps) {
  const [volume, setVolume] = createSignal<number | null>(null);
  const [loading, setLoading] = createSignal(true);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  const refresh = async () => {
    setLoading(true);
    try {
      setVolume(Math.round((await steps.load()) * 100));
    } catch (error) {
      setVolume(null);
      steps.notify("Volume didn't load", {
        tone: 'error',
        details: String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const save = async (next: number) => {
    try {
      await steps.save(next / 100);
    } catch (error) {
      steps.notify("Volume didn't change", {
        tone: 'error',
        details: String(error),
        action: { label: 'Retry', run: () => void save(next) },
      });
      await refresh();
    }
  };

  const adjustable = () => !loading() && volume() !== null;

  const change = (next: number) => {
    if (!adjustable()) {
      return;
    }
    const clamped = Math.max(0, Math.min(MAX_VOLUME, next));
    setVolume(clamped);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(clamped), 350);
  };

  return {
    volume,
    loading,
    adjustable,
    /** The load failed and nothing is loading it again yet. */
    failed: () => !loading() && volume() === null,
    refresh,
    change,
    dispose: () => clearTimeout(saveTimer),
  };
}
