import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);

let sheets: Record<string, string>;

beforeAll(async () => {
  const { stdout } = await run(
    process.execPath,
    [
      fileURLToPath(new URL('../test/support/render-app.mjs', import.meta.url)),
      '/src/Sheet.render-fixture.tsx',
    ],
    { timeout: 30_000 },
  );
  sheets = JSON.parse(stdout) as Record<string, string>;
}, 40_000);

// The dialog's own markup: what its Tab trap can reach.
const dialogOf = (html: string) => html.slice(html.indexOf('role="dialog"'));

describe('toasts while a sheet is open', () => {
  it.each(['license', 'buy'])(
    'the %s sheet holds the toast and its Retry inside its dialog',
    (name) => {
      const dialog = dialogOf(sheets[name]);
      expect(dialog).toContain('didn’t download');
      expect(dialog).toContain('>Retry<');
      expect(dialog).toContain('aria-label="Dismiss notification"');
    },
  );
});
