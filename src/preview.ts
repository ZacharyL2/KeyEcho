import { createSignal } from 'solid-js';

import { commands } from './services/bindings';

const PREVIEW_BURST_MS = 1200;

/**
 * One catalog preview at a time: which pack is loading, playing or failed.
 * A press on the pack that is playing stops it.
 */
export function createPreview() {
  const [playingId, setPlayingId] = createSignal<string | null>(null);
  const [loadingId, setLoadingId] = createSignal<string | null>(null);
  const [failedId, setFailedId] = createSignal<string | null>(null);
  // Each burst's own end; a stopped or newer burst outlives an older timer.
  let burst = 0;

  const preview = async (id: string) => {
    if (playingId() === id) {
      burst++;
      setPlayingId(null);
      await commands.stopPreview();
      return;
    }
    const current = ++burst;
    setFailedId(null);
    setPlayingId(null);
    setLoadingId(id);
    try {
      const result = await commands.previewCatalogPack(id);
      if (result.status === 'error') {
        throw new Error(result.error);
      }
      if (current !== burst) {
        return;
      }
      setPlayingId(id);
      window.setTimeout(() => {
        if (current === burst) {
          setPlayingId(null);
        }
      }, PREVIEW_BURST_MS);
    } catch {
      if (current === burst) {
        setPlayingId(null);
        setFailedId(id);
      }
    } finally {
      setLoadingId((loading) => (loading === id ? null : loading));
    }
  };

  return { playingId, loadingId, failedId, preview };
}

export type Preview = ReturnType<typeof createPreview>;
