import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

// Visible text of rendered HTML: tags and hydration comments dropped.
const textOf = (html: string) =>
  html
    .replaceAll(/<!--.*?-->|<[^>]+>/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

let bars: Record<string, string>;

beforeAll(async () => {
  const { stdout } = await run(
    process.execPath,
    [
      fileURLToPath(new URL('../test/support/render-app.mjs', import.meta.url)),
      '/src/OfferBar.render-fixture.tsx',
    ],
    { timeout: 30_000 },
  );
  bars = Object.fromEntries(
    Object.entries(JSON.parse(stdout) as Record<string, string>).map(
      ([bar, html]) => [bar, textOf(html)],
    ),
  );
}, 40_000);

describe('offer bars while a pack checkout is open', () => {
  it.each(['dock', 'slim'])(
    'the %s bar says which checkout waits and offers Cancel',
    (bar) => {
      expect(bars[bar]).toContain(
        'Finish buying Big Key Thock in your browser',
      );
      expect(bars[bar]).toContain('Cancel');
    },
  );
});
