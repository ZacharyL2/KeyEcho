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

let sheet: Record<string, string>;

beforeAll(async () => {
  const { stdout } = await run(
    process.execPath,
    [
      fileURLToPath(new URL('../test/support/render-app.mjs', import.meta.url)),
      '/src/BuySheet.render-fixture.tsx',
    ],
    { timeout: 30_000 },
  );
  sheet = Object.fromEntries(
    Object.entries(JSON.parse(stdout) as Record<string, string>).map(
      ([moment, html]) => [moment, textOf(html)],
    ),
  );
}, 40_000);

describe('Buy sheet while a checkout is open', () => {
  it('waiting on one pack names that pack and its price, not All Sounds Forever', () => {
    expect(sheet.ownPackPending).toContain('Retro Enter');
    expect(sheet.ownPackPending).toContain('$2.99');
    expect(sheet.ownPackPending).not.toContain('All Sounds Forever');
  });

  it('opened on another pack shows the open checkout and offers no second one', () => {
    const text = sheet.otherPackWhilePackPending;
    expect(text).toContain('Retro Enter');
    expect(text).toContain('$2.99');
    expect(text).not.toContain('All Sounds Forever');
    expect(text).not.toContain('Big Key Thock');
    expect(text).toContain('Cancel');
    expect(text).not.toContain('Continue on keyecho.app');
  });

  it('after Cancel offers the pack it was opened on again', () => {
    const text = sheet.otherPackAfterCancel;
    expect(text).toContain('Big Key Thock');
    expect(text).toContain('$4.99');
    expect(text).toContain('Continue on keyecho.app');
  });

  it('opened on a pack while All Sounds Forever is being bought names All Sounds Forever', () => {
    const text = sheet.packWhileAllPending;
    expect(text).toContain('All Sounds Forever');
    expect(text).not.toContain('Big Key Thock');
    expect(text).not.toContain('Continue on keyecho.app');
  });
});
