import { afterEach, describe, expect, it, vi } from 'vitest';

import { coverUrl, fetchCover } from './cover';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pack covers', () => {
  it('reads the small and large line art from the site', () => {
    expect(coverUrl('creamy-thock-smooth', 'small')).toBe(
      'https://keyecho.app/packs/creamy-thock-smooth.webp',
    );
    expect(coverUrl('creamy-thock-smooth', 'large')).toBe(
      'https://keyecho.app/packs/creamy-thock-smooth-1200.webp',
    );
  });

  it('inlines a fetched image as a data URL', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response(new Blob(['webp'], { type: 'image/webp' })),
    );
    expect(await fetchCover('https://keyecho.app/packs/x.webp')).toMatch(
      /^data:image\/webp;base64,/,
    );
  });

  it('falls back quietly when the cover is missing or blocked', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    expect(await fetchCover('https://keyecho.app/packs/x.webp')).toBeNull();

    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Load failed');
    });
    expect(await fetchCover('https://keyecho.app/packs/x.webp')).toBeNull();

    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    );
    expect(await fetchCover('https://keyecho.app/packs/x.webp')).toBeNull();
  });
});
