import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(path.join(__dirname, 'index.css'), 'utf8');
const src = path.join(__dirname, '..');
const app = readFileSync(path.join(src, 'App.tsx'), 'utf8');
const buy = readFileSync(path.join(src, 'buy.ts'), 'utf8');
const deeplink = readFileSync(path.join(src, 'deeplink.ts'), 'utf8');
const bindings = readFileSync(
  path.join(src, 'services', 'bindings.ts'),
  'utf8',
);

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} is missing`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('}', start));
}

describe('.text-button', () => {
  // It is the "other path" beside a primary action, so it must not grow a
  // second keycap: no border, no fill, no shadow.
  const base = rule('.text-button');

  it('has no border', () => {
    expect(base).toMatch(/border:\s*0;/);
    expect(base).not.toMatch(/border:[^;]*(?:solid|dashed|dotted)/);
  });

  it('has no fill and no shadow', () => {
    expect(base).toMatch(/background:\s*none;/);
    expect(base).toMatch(/box-shadow:\s*none;/);
  });

  it('keeps a pointer target as tall as the other controls', () => {
    expect(base).toMatch(/min-height:\s*2\.5rem;/);
  });

  it('keeps a visible focus ring', () => {
    expect(rule('.text-button:focus-visible')).toMatch(/outline:\s*2px solid/);
  });

  it('is what the dialogs use to close', () => {
    const closers = app.match(
      /<button class="text-button" type="button" onClick=\{props\.onClose\}>/g,
    );
    // Browse packs closes from its header ×; License keeps a footer Close.
    expect(closers).toHaveLength(1);
  });
});

describe('sound library purchase hierarchy', () => {
  it('keeps the offer to a title, one fact line and the button', () => {
    expect(app).toContain('Every Crafted Pack, now and future');
    expect(app).toContain('packs</span>');
    expect(app).toContain('free packs stay free</span>');
    expect(app).toContain('14-day refund</span>');
    expect(app).toContain(
      'title="Pay on keyecho.app · unlocks here automatically"',
    );
    expect(app).toContain('Get every pack · $9.99');
    expect(app).not.toContain('All Sounds Forever');
    expect(app).not.toContain('Less than');
    expect(rule('.sound-library-offer-button')).toMatch(/min-width:\s*10rem;/);
  });

  it('gives installed packs a real Use button beside an Installed status', () => {
    expect(app).toContain('<span class="installed-mark">');
    expect(app).toContain('In use');
    expect(app).not.toContain('sound-download-owned');
    expect(css).not.toContain('.sound-download-owned');
  });

  it('sends every paid row to the one offer instead of a single-pack buy', () => {
    expect(app).toContain('Unlock all');
    expect(app).toContain("campaign: 'pack_row'");
    expect(app).not.toContain('startPackBuyFlow(');
  });

  it('names the waiting purchase and offers a way out of it', () => {
    expect(app).toContain('Waiting for keyecho.app…');
    expect(buy).toContain('Still waiting · Paste your key');
    expect(buy).toContain('export function cancelPurchase()');
  });
});

describe('status bar copy', () => {
  it('reports playback state instead of instructing the user', () => {
    expect(app).toContain('Ready · last key');
    expect(app).toContain('Pick a pack to start');
    expect(app).toContain('No packs yet');
    expect(app).toContain('Muted · volume 0');
    expect(app).toContain('Loading packs');
    expect(app).not.toContain('TYPE ANYWHERE TO HEAR IT');
  });
});

describe('license dialog copy', () => {
  it('separates activating a key from getting one sent', () => {
    expect(app).toContain('Activate');
    expect(app).toContain('Forget this key');
    expect(app).toContain('Paste the key from your email');
    expect(app).toContain("That key isn't recognized");
    expect(app).toContain("Can't reach keyecho.app right now");
    expect(app).toContain('Lost your key? Send it to my email');
    expect(app).toContain(
      'If that email has a purchase, the key is on its way.',
    );
    expect(app).toContain('This key has no packs yet');
  });
});

describe('toast policy', () => {
  it('drops the routine success toasts and the apologetic wording', () => {
    for (const source of [app, buy, deeplink]) {
      expect(source).not.toContain('successfully');
      expect(source).not.toContain('Please');
      expect(source).not.toContain('Reason: ');
    }
  });
});

describe('v1 pack import', () => {
  it('is gone from the app and its bindings', () => {
    for (const source of [app, bindings]) {
      expect(source).not.toContain('legacy');
      expect(source).not.toContain('press only (v1)');
      expect(source).not.toContain('importSoundPack');
    }
  });
});
