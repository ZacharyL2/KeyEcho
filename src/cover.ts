import type { Accessor } from 'solid-js';
import { createSignal } from 'solid-js';

import { KEYECHO_ORIGIN } from './origin';

export type CoverSize = 'small' | 'large';

export function coverUrl(packId: string, size: CoverSize): string {
  const suffix = size === 'large' ? '-1200' : '';
  return `${KEYECHO_ORIGIN}/packs/${encodeURIComponent(packId)}${suffix}.webp`;
}

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

// The window only allows data: images, so covers are fetched and inlined.
// A failed cover stays a tinted tile until the next launch; no retries.
export async function fetchCover(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
      return null;
    }
    return await toDataUrl(blob);
  } catch {
    return null;
  }
}

function whenVisible(): Promise<void> {
  if (
    typeof document === 'undefined' ||
    document.visibilityState !== 'hidden'
  ) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState !== 'hidden') {
        document.removeEventListener('visibilitychange', onChange);
        resolve();
      }
    };
    document.addEventListener('visibilitychange', onChange);
  });
}

const covers = new Map<string, Accessor<string | null>>();

/** The cover as a data: URL once loaded; null while loading or when it failed. */
export function packCover(
  packId: string,
  size: CoverSize,
): Accessor<string | null> {
  const url = coverUrl(packId, size);
  const known = covers.get(url);
  if (known) {
    return known;
  }
  const [cover, setCover] = createSignal<string | null>(null);
  covers.set(url, cover);
  if (typeof document !== 'undefined') {
    void whenVisible()
      .then(() => fetchCover(url))
      .then(setCover);
  }
  return cover;
}
