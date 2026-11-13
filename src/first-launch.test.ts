import { describe, expect, it } from 'vitest';

import type { FirstLaunchScene } from './first-launch';
import { firstLaunchAction, firstLaunchNote, homeView } from './first-launch';
import { firstLaunchHintKeys } from './hint-keys';

const STARTER = { id: 'click-beats-snappy', free: true };
const OTHER_FREE = { id: 'studio-key-04-thock', free: true };
const PAID = { id: 'newsroom-typewriter', free: false };

const scene = (patch: Partial<FirstLaunchScene>): FirstLaunchScene => ({
  shown: STARTER,
  starterId: STARTER.id,
  starterState: 'idle',
  downloading: null,
  ...patch,
});

const enterHint = (value: FirstLaunchScene) =>
  firstLaunchHintKeys(firstLaunchAction(value)).find(
    ([key]) => key === 'enter',
  )?.[1];

describe('first launch: button, enter and hint agree', () => {
  it('while pack A downloads, free pack B can not download and offers no enter', () => {
    const switched = scene({
      shown: OTHER_FREE,
      starterState: 'failed',
      downloading: { id: STARTER.id, name: 'Click Beats' },
    });
    expect(firstLaunchAction(switched)).toBe('busy');
    expect(enterHint(switched)).toBeUndefined();
  });

  it('pack A itself shows saving and offers no enter', () => {
    const own = scene({
      starterState: 'failed',
      downloading: { id: STARTER.id, name: 'Click Beats' },
    });
    expect(firstLaunchAction(own)).toBe('saving');
    expect(enterHint(own)).toBeUndefined();
  });

  it('a paid pack still offers get while another pack downloads', () => {
    const paid = scene({
      shown: PAID,
      downloading: { id: STARTER.id, name: 'Click Beats' },
    });
    expect(firstLaunchAction(paid)).toBe('get');
    expect(enterHint(paid)).toBe('get');
  });

  it('the starter installing by itself shows saving on that pack only', () => {
    expect(firstLaunchAction(scene({ starterState: 'installing' }))).toBe(
      'saving',
    );
    const other = scene({ shown: OTHER_FREE, starterState: 'installing' });
    expect(firstLaunchAction(other)).toBe('download');
    expect(enterHint(other)).toBe('download');
  });

  it('no pack shown: no action and no preview', () => {
    expect(firstLaunchAction(scene({ shown: null }))).toBeNull();
    expect(firstLaunchHintKeys(null)).toEqual([['← →', 'character']]);
  });
});

describe('first launch: the line under the picker', () => {
  it('says the free pack failed only under that pack', () => {
    expect(firstLaunchNote(scene({ starterState: 'failed' }))).toEqual({
      message: "Free pack didn't download",
      retryStarter: true,
    });
    for (const shown of [PAID, OTHER_FREE]) {
      expect(firstLaunchNote(scene({ shown, starterState: 'failed' }))).toEqual(
        { message: 'No packs yet', retryStarter: false },
      );
    }
  });

  it('with no pack to show, the failure still has its Retry', () => {
    expect(
      firstLaunchNote(scene({ shown: null, starterState: 'failed' })),
    ).toEqual({ message: "Free pack didn't download", retryStarter: true });
  });

  it('names the pack saving when another pack is shown', () => {
    const downloading = { id: STARTER.id, name: 'Click Beats' };
    expect(
      firstLaunchNote(
        scene({ shown: OTHER_FREE, starterState: 'failed', downloading }),
      ).message,
    ).toBe('Saving Click Beats…');
    expect(
      firstLaunchNote(scene({ starterState: 'failed', downloading })),
    ).toEqual({ message: 'No packs yet', retryStarter: false });
  });
});

describe('home view while the installed packs load', () => {
  it('shows neither Home nor first launch before the list first arrives', () => {
    for (const state of ['unresolved', 'pending'] as const) {
      expect(homeView({ state, failed: false, count: 0 })).toBe('pending');
    }
  });

  it('a refresh keeps first launch and Home as they were', () => {
    expect(homeView({ state: 'refreshing', failed: false, count: 0 })).toBe(
      'first',
    );
    expect(homeView({ state: 'refreshing', failed: false, count: 3 })).toBe(
      'home',
    );
  });

  it('a list that did not load is told on Home', () => {
    expect(homeView({ state: 'errored', failed: true, count: 0 })).toBe('home');
  });
});
