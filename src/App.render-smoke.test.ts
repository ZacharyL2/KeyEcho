import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { beforeAll, expect, it } from 'vitest';

const run = promisify(execFile);

let html = '';
let text = '';

beforeAll(async () => {
  // Keep SSR out of the client-side Solid conditions used by this test runner.
  const { stdout } = await run(
    process.execPath,
    [fileURLToPath(new URL('../test/support/render-app.mjs', import.meta.url))],
    { timeout: 30_000 },
  );
  html = stdout;
  text = stdout
    .replaceAll(/<script[\s\S]*?<\/script>|<!--.*?-->|<[^>]+>/g, ' ')
    .replaceAll(/\s+/g, ' ');
}, 40_000);

it('App renders without throwing', () => {
  expect(text).toContain('Volume');
});

it('Home shows neither a pack nor first launch before the installed packs are known', () => {
  // The render never hears back from the backend about installed packs.
  expect(html).toContain('aria-busy="true"');
  expect(text).not.toContain('No pack');
  expect(text).not.toContain('Loading packs');
  expect(text).not.toContain('Change pack');
  expect(text).not.toContain('Pick how your keyboard should sound');
  expect(text).not.toContain('← → pack');
  expect(text).not.toContain('find a pack');
});

it('Home shows no volume and no volume keys before the volume is known', () => {
  // The render never hears back from the backend, so the volume is unknown.
  expect(html).not.toContain('aria-valuenow');
  expect(html).toContain('aria-valuetext="Not loaded"');
  expect(text).not.toContain('↑ ↓ volume');
});
