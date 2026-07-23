import { invoke } from '@tauri-apps/api/core';

export type CommandResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'error'; error: string };

export type SoundOption = {
  name: string;
  value: string;
};

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function callCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<CommandResult<T>> {
  try {
    return { status: 'ok', data: await invoke<T>(command, args) };
  } catch (error) {
    return { status: 'error', error: stringifyError(error) };
  }
}

export const commands = {
  isAutoLaunchEnabled() {
    return callCommand<boolean>('is_auto_launch_enabled');
  },

  setAutoLaunch(enabled: boolean) {
    return callCommand<null>('set_auto_launch', { enabled });
  },

  downloadSound(url: string) {
    return callCommand<null>('download_sound', { url });
  },

  // Import the user's v1 packs from the fixed legacy path; [] when none found.
  importSoundPack() {
    return callCommand<SoundOption[]>('import_sound_pack');
  },

  openExternalUrl(url: string) {
    return callCommand<null>('open_external_url', { url });
  },

  getSounds() {
    return callCommand<SoundOption[]>('get_sounds');
  },

  // Installed packs with no key-up samples (imported v1 packs).
  pressOnlyPacks() {
    return callCommand<string[]>('press_only_packs');
  },

  // How many v1 packs are still on this machine, waiting to be imported.
  legacyPacksAvailable() {
    return callCommand<number>('legacy_packs_available');
  },

  getSelectedSound() {
    return callCommand<string | null>('get_selected_sound');
  },

  selectSound(sound: string) {
    return callCommand<null>('select_sound', { sound });
  },

  // Audition the current pack: a short burst of random keys through the sink.
  previewPackSound() {
    return callCommand<null>('preview_pack_sound');
  },

  getVolume() {
    return callCommand<number>('get_volume');
  },

  updateVolume(volume: number) {
    return callCommand<null>('update_volume', { volume });
  },
};
