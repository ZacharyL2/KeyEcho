import { packLabel } from './catalog';
import {
  fetchEntitledPacks,
  packDownloadUrl,
  rememberVerifiedLicense,
  storeLicenseKey,
} from './license';
import type { Notify } from './notify';
import type { CommandResult, SoundOption } from './services/bindings';
import { commands } from './services/bindings';

export function unwrapCommand<T>(result: CommandResult<T>): T {
  if (result.status === 'ok') {
    return result.data;
  }

  throw new Error(result.error);
}

export type InstalledSound = SoundOption & { label: string };

/**
 * Installed packs, named from the catalog or the names it gave last time.
 * Does not wait for the catalog: a slow keyecho.app must not hide them.
 */
export async function loadSounds(): Promise<InstalledSound[]> {
  const sounds = unwrapCommand(await commands.getSounds());
  return sounds.map((sound) => ({ ...sound, label: packLabel(sound.name) }));
}

export async function loadSelectedSound(): Promise<string | null> {
  return unwrapCommand(await commands.getSelectedSound());
}

export async function openExternalUrl(url: string, notify: Notify) {
  const result = await commands.openExternalUrl(url);
  if (result.status === 'error') {
    notify("Link didn't open", { tone: 'error', details: result.error });
  }
}

/**
 * Persist a licence key and install every entitled pack that isn't installed.
 *
 * Module scope on purpose: a keyecho://activate deep link has to work whether or
 * not the License sheet happens to be mounted. Returns the entitled pack ids.
 */
export async function activateLicense(
  key: string,
  notify: Notify,
  onInstalled?: () => void,
): Promise<{ entitled: string[]; installed: string[] }> {
  const packs = await fetchEntitledPacks(key);
  storeLicenseKey(key);
  rememberVerifiedLicense(key, packs);

  const already = new Set((await loadSounds()).map((sound) => sound.name));
  const installed = await installPacks(
    packs.filter((packId) => !already.has(packId)),
    key,
    notify,
    onInstalled,
  );
  return { entitled: packs, installed };
}

/**
 * Download packs one by one. However many fail, one toast says so and its
 * Retry tries just those again. Returns the ids that installed.
 */
async function installPacks(
  packIds: readonly string[],
  key: string,
  notify: Notify,
  onInstalled?: () => void,
): Promise<string[]> {
  const installed: string[] = [];
  const failed: { packId: string; error: string }[] = [];
  for (const packId of packIds) {
    try {
      unwrapCommand(await commands.downloadSound(packDownloadUrl(packId), key));
      installed.push(packId);
      // Refresh per pack, not once at the end: downloads take seconds, and
      // waiting for the whole batch makes the list look stale after activation.
      onInstalled?.();
    } catch (error) {
      // One failure shouldn't abort the rest of the purchase.
      failed.push({ packId, error: String(error) });
    }
  }
  const [first] = failed;
  if (first) {
    notify(
      failed.length === 1
        ? `${packLabel(first.packId)} didn't download`
        : `${failed.length} packs didn't download`,
      {
        tone: 'error',
        details: failed
          .map(({ packId, error }) => `${packLabel(packId)}: ${error}`)
          .join('\n'),
        action: {
          label: 'Retry',
          run: () =>
            void installPacks(
              failed.map(({ packId }) => packId),
              key,
              notify,
              onInstalled,
            ),
        },
      },
    );
  }
  return installed;
}

/** Arm a pack by id right after install, so a one-pack purchase is audible at
 *  once. Returns false when the pack isn't in the installed list (yet). */
export async function selectPackById(packId: string): Promise<boolean> {
  const match = (await loadSounds()).find((sound) => sound.name === packId);
  if (!match) {
    return false;
  }
  const result = await commands.selectSound(match.value);
  if (result.status === 'error') {
    return false;
  }
  void commands.previewPackSound(); // audible confirmation of what you bought
  return true;
}
