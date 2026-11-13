import { expect, test } from 'vitest';

import { createStarterPackSetup } from './starter-pack';

const CATALOG = [
  { id: 'paid-thock', tier: 'paid' },
  {
    id: 'free-click',
    tier: 'free',
    downloadUrl: 'https://cdn.test/free-click.tar',
  },
  {
    id: 'free-linear',
    tier: 'free',
    downloadUrl: 'https://cdn.test/free-linear.tar',
  },
];

// In-memory profile: downloads add a pack, select arms one.
function fakeProfile(installed: string[] = []) {
  const profile = {
    installed: [...installed],
    selected: null as string | null,
    downloadFailures: 0,
    catalogFailures: 0,
    selectFailures: 0,
    selectCalls: 0,
  };
  const steps = {
    installedNames: async () => [...profile.installed],
    loadCatalog: async () => {
      if (profile.catalogFailures > 0) {
        profile.catalogFailures -= 1;
        throw new Error('offline');
      }
      return CATALOG;
    },
    download: async (url: string) => {
      if (profile.downloadFailures > 0) {
        profile.downloadFailures -= 1;
        throw new Error('offline');
      }
      profile.installed.push(url.split('/').pop()!.replace('.tar', ''));
    },
    select: async (packId: string) => {
      profile.selectCalls += 1;
      if (profile.selectFailures > 0) {
        profile.selectFailures -= 1;
        throw new Error('select failed');
      }
      if (!profile.installed.includes(packId)) {
        throw new Error('not installed');
      }
      profile.selected = packId;
    },
  };
  return { profile, steps };
}

test('an empty profile gets the first free pack installed and selected', async () => {
  const { profile, steps } = fakeProfile();
  const setup = createStarterPackSetup(steps);

  await setup.run();

  expect(profile.installed).toEqual(['free-click']);
  expect(profile.selected).toBe('free-click');
  expect(setup.state()).toBe('done');
});

test('a failed download leaves the profile empty and a retry recovers', async () => {
  const { profile, steps } = fakeProfile();
  profile.downloadFailures = 1;
  const setup = createStarterPackSetup(steps);

  await setup.run();
  expect(setup.state()).toBe('failed');
  expect(profile.installed).toEqual([]);
  expect(profile.selected).toBeNull();

  await setup.run();
  expect(setup.state()).toBe('done');
  expect(profile.selected).toBe('free-click');
});

test('an offline catalog fails and a retry recovers', async () => {
  const { profile, steps } = fakeProfile();
  profile.catalogFailures = 1;
  const setup = createStarterPackSetup(steps);

  await setup.run();
  expect(setup.state()).toBe('failed');

  await setup.run();
  expect(profile.selected).toBe('free-click');
});

test('a profile that already has a pack is left alone', async () => {
  const { profile, steps } = fakeProfile(['paid-thock']);
  const setup = createStarterPackSetup(steps);

  await setup.run();

  expect(profile.installed).toEqual(['paid-thock']);
  expect(profile.selected).toBeNull();
});

test('a pack that installed but failed to select is selected on retry', async () => {
  const { profile, steps } = fakeProfile();
  profile.selectFailures = 1;
  const setup = createStarterPackSetup(steps);

  await setup.run();
  expect(setup.state()).toBe('failed');
  expect(profile.installed).toEqual(['free-click']);
  expect(profile.selected).toBeNull();

  await setup.run();
  expect(setup.state()).toBe('done');
  expect(profile.selected).toBe('free-click');
  expect(profile.selectCalls).toBe(2);
  expect(profile.installed).toEqual(['free-click']);
});
