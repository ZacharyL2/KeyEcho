import type { StarterPackState } from './starter-pack';

/**
 * What the first-launch button and enter do for the pack shown: download it,
 * show it saving, wait because another pack is saving (one download at a
 * time), or open Get for a paid pack.
 */
export type FirstLaunchAction = 'download' | 'saving' | 'busy' | 'get';

export interface FirstLaunchScene {
  /** The pack shown for the picked character; null when there is none. */
  shown: { id: string; free: boolean } | null;
  /** The pack the app installs by itself on first launch. */
  starterId: string | undefined;
  starterState: StarterPackState;
  /** The pack a Download press is saving. */
  downloading: { id: string; name: string } | null;
}

export function firstLaunchAction(
  scene: FirstLaunchScene,
): FirstLaunchAction | null {
  const { shown, downloading } = scene;
  if (!shown) {
    return null;
  }
  if (!shown.free) {
    return 'get';
  }
  if (
    downloading?.id === shown.id ||
    (scene.starterState === 'installing' && scene.starterId === shown.id)
  ) {
    return 'saving';
  }
  return downloading ? 'busy' : 'download';
}

/** The line in the level tape, and whether it offers to retry the starter pack. */
export function firstLaunchNote(scene: FirstLaunchScene): {
  message: string;
  retryStarter: boolean;
} {
  const { shown, downloading } = scene;
  if (scene.starterState === 'installing') {
    return { message: 'Getting a free pack', retryStarter: false };
  }
  if (downloading) {
    // The shown pack's own button already says Saving….
    return downloading.id === shown?.id
      ? { message: 'No packs yet', retryStarter: false }
      : { message: `Saving ${downloading.name}…`, retryStarter: false };
  }
  // The failure belongs to the starter pack: say it only under that pack.
  if (
    scene.starterState === 'failed' &&
    (!shown || shown.id === scene.starterId)
  ) {
    return { message: "Free pack didn't download", retryStarter: true };
  }
  return { message: 'No packs yet', retryStarter: false };
}

/**
 * What Home shows: nothing of its own until the installed packs are first
 * known, then first launch when there are none. A refresh keeps the last
 * answer, so the window does not flash the other screen meanwhile.
 */
export type HomeView = 'pending' | 'first' | 'home';

export function homeView(sounds: {
  state: 'unresolved' | 'pending' | 'ready' | 'refreshing' | 'errored';
  failed: boolean;
  count: number;
}): HomeView {
  if (sounds.failed) {
    return 'home';
  }
  if (sounds.state === 'unresolved' || sounds.state === 'pending') {
    return 'pending';
  }
  return sounds.count === 0 ? 'first' : 'home';
}
