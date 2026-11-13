import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Every screen of the window, read as one source.
const app = readdirSync(__dirname)
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => readFileSync(path.join(__dirname, name), 'utf8'))
  .join('\n');
const buy = readFileSync(path.join(__dirname, 'buy.ts'), 'utf8');
const deeplink = readFileSync(path.join(__dirname, 'deeplink.ts'), 'utf8');

describe('sound library purchase hierarchy', () => {
  it('keeps the offer to a name, one fact line and the button', () => {
    expect(app).toContain("'All Sounds Forever'");
    expect(app).toContain('paid packs and every future one.');
    expect(app).toContain('14-day refund');
    expect(app).toContain(
      'title="Pay on keyecho.app · unlocks here automatically"',
    );
    expect(app).toContain('Get it');
  });

  it('names the pack in use and the waiting purchase', () => {
    expect(app).toContain('In use');
    expect(app).toContain('Waiting for keyecho.app…');
    expect(buy).toContain('Still waiting · Paste your key');
  });

  it('tags paid-row clicks with the pack_row campaign', () => {
    expect(app).toContain("'pack_row'");
  });
});

describe('home status copy', () => {
  it('reports playback state instead of instructing the user', () => {
    expect(app).toContain('Pick a pack to start');
    expect(app).toContain('No packs yet');
    expect(app).toContain('Muted · volume 0');
    expect(app).toContain('Loading packs');
  });
});

describe('license dialog copy', () => {
  it('separates activating a key from getting one sent', () => {
    expect(app).toContain('Activate');
    expect(app).toContain('Forget this key');
    expect(app).toContain('Paste the key from your email');
    expect(app).toContain("That key isn't recognized");
    expect(app).toContain("Can't reach keyecho.app right now");
    expect(app).toContain(
      'Lost your key? We email every key on file for that address.',
    );
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
