import { isTauri } from '@tauri-apps/api/core';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import type { JSX } from 'solid-js';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import type { InferOutput } from 'valibot';
import { array, literal, object, parseAsync, pipe, string, url } from 'valibot';

import iconUrl from '../src-tauri/icons/Square71x71Logo.png';
import type { CommandResult, SoundOption } from './services/bindings';
import { commands } from './services/bindings';

const PACK_CATALOG_URL = 'https://keyecho.app/packs/index.json';
const GITHUB_SOUND_FALLBACK_URL =
  'https://api.github.com/repos/ZacharyL2/KeyEcho/contents/src-tauri/resources';

const APP_VERSION = '1.0.0';
const APP_CAMPAIGN = `v${APP_VERSION.replace(/\./g, '_')}`;
const KEYECHO_VOTE_URL = `https://keyecho.app/?source=keyecho_app&intent=sound_pack_vote&version=${APP_VERSION}&utm_source=keyecho_app&utm_medium=desktop&utm_campaign=${APP_CAMPAIGN}#queue`;
const PROJECT_UPDATE_DISMISSED_KEY = `keyecho:v${APP_VERSION}:update-dismissed-session`;
const APP_UPDATE_CHECK_DELAY_MS = 1200;

let appUpdateCheckStarted = false;

// Pack lists are remote (GitHub) and grow over time, so display names come
// from token rules rather than a per-pack map: brand tokens that don't
// title-case cleanly are listed here, everything else is title-cased as-is.
const SOUND_NAME_TOKENS: Record<string, string> = {
  abs: 'ABS',
  cherrymx: 'Cherry MX',
  eg: 'EG',
  nk: 'NK',
  pbt: 'PBT',
};

function displaySoundName(rawName: string): string {
  return rawName
    .replace(/\.tar$/, '')
    .split('-')
    .map(
      (word) =>
        SOUND_NAME_TOKENS[word] ??
        (word ? word[0].toUpperCase() + word.slice(1) : word),
    )
    .join(' ');
}

const GithubSoundsSchema = array(
  object({
    name: string(),
    type: literal('file'),
    download_url: pipe(string(), url()),
  }),
);

const PackCatalogSchema = object({
  schemaVersion: literal(1),
  packs: array(
    object({
      id: string(),
      name: string(),
      downloadUrl: pipe(string(), url()),
    }),
  ),
});

type GithubSound = InferOutput<typeof GithubSoundsSchema>[number];
type PackCatalog = InferOutput<typeof PackCatalogSchema>;

interface OnlineSound {
  downloadUrl: string;
  id: string;
  name: string;
}

type ToastTone = 'default' | 'error';

interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

type Notify = (message: string, tone?: ToastTone) => void;

function unwrapCommand<T>(result: CommandResult<T>): T {
  if (result.status === 'ok') {
    return result.data;
  }

  throw new Error(result.error);
}

async function loadSounds(): Promise<SoundOption[]> {
  return unwrapCommand(await commands.getSounds());
}

async function loadSelectedSound(): Promise<string | null> {
  return unwrapCommand(await commands.getSelectedSound());
}

async function openExternalUrl(url: string, notify: Notify) {
  const result = await commands.openExternalUrl(url);
  if (result.status === 'error') {
    notify(`Link failed to open. Reason: ${result.error}`, 'error');
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

function soundIdFromArchiveName(name: string): string {
  return name.replace(/\.tar$/, '');
}

function mapPackCatalog(catalog: PackCatalog): OnlineSound[] {
  return catalog.packs.map((pack) => ({
    downloadUrl: pack.downloadUrl,
    id: pack.id,
    name: pack.name,
  }));
}

function mapGithubSounds(sounds: GithubSound[]): OnlineSound[] {
  return sounds.map((sound) => ({
    downloadUrl: sound.download_url,
    id: soundIdFromArchiveName(sound.name),
    name: sound.name,
  }));
}

async function loadOfficialOnlineSounds(): Promise<OnlineSound[]> {
  return mapPackCatalog(
    await parseAsync(PackCatalogSchema, await fetchJson(PACK_CATALOG_URL)),
  );
}

async function loadFallbackOnlineSounds(): Promise<OnlineSound[]> {
  return mapGithubSounds(
    await parseAsync(
      GithubSoundsSchema,
      await fetchJson(GITHUB_SOUND_FALLBACK_URL),
    ),
  );
}

async function loadOnlineSounds(): Promise<OnlineSound[]> {
  try {
    return await loadOfficialOnlineSounds();
  } catch (officialError) {
    try {
      return await loadFallbackOnlineSounds();
    } catch (fallbackError) {
      throw new Error(
        `Pack catalog failed. Official source: ${officialError}; GitHub fallback: ${fallbackError}`,
      );
    }
  }
}

function hasDismissedProjectUpdate(): boolean {
  try {
    return sessionStorage.getItem(PROJECT_UPDATE_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberProjectUpdateDismissed() {
  try {
    sessionStorage.setItem(PROJECT_UPDATE_DISMISSED_KEY, 'true');
  } catch {
    // Dismissal is only a comfort preference; failing to store it is harmless.
  }
}

function forgetProjectUpdateDismissed() {
  try {
    sessionStorage.removeItem(PROJECT_UPDATE_DISMISSED_KEY);
  } catch {
    // Showing the update again is best-effort.
  }
}

function createAppUpdateMessage(version: string, notes?: string): string {
  const trimmedNotes = notes?.trim();

  return [
    `KeyEcho ${version} is available.`,
    'Install it now and restart KeyEcho?',
    trimmedNotes ? `\nRelease notes:\n${trimmedNotes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function checkForAppUpdate(notify: Notify) {
  if (appUpdateCheckStarted || !isTauri()) {
    return;
  }

  appUpdateCheckStarted = true;

  let update: Awaited<ReturnType<typeof check>>;
  try {
    update = await check();
  } catch {
    return;
  }

  if (!update) {
    return;
  }

  // eslint-disable-next-line no-alert
  const accepted = window.confirm(
    createAppUpdateMessage(update.version, update.body),
  );

  if (!accepted) {
    await update.close().catch(() => {});
    return;
  }

  try {
    notify(`Downloading KeyEcho ${update.version}...`);
    await update.downloadAndInstall();
    notify('Update installed. Restarting KeyEcho...');
    await relaunch();
  } catch (error) {
    notify(`Update install failed. Reason: ${error}`, 'error');
  } finally {
    await update.close().catch(() => {});
  }
}

function createNotifier() {
  const [toasts, setToasts] = createSignal<Toast[]>([]);

  const removeToast = (id: string) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  };

  const notify: Notify = (message, tone = 'default') => {
    const id =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToasts((items) => [...items, { id, message, tone }]);
    window.setTimeout(removeToast, 2400, id);
  };

  return { notify, removeToast, toasts };
}

function Toasts(props: {
  toasts: () => Toast[];
  removeToast: (id: string) => void;
}) {
  return (
    <div aria-live="polite" class="toast-stack">
      <For each={props.toasts()}>
        {(toast) => (
          <button
            aria-label="Dismiss notification"
            class={`toast-card ${toast.tone === 'error' ? 'toast-error' : ''}`}
            type="button"
            onClick={() => props.removeToast(toast.id)}
          >
            {toast.message}
          </button>
        )}
      </For>
    </div>
  );
}

function AutoLaunchSetting(props: { notify: Notify }) {
  const [enabled, setEnabled] = createSignal(false);
  const [loading, setLoading] = createSignal(true);

  const refresh = async () => {
    setLoading(true);
    try {
      setEnabled(await isEnabled());
    } catch (error) {
      props.notify(`Auto launch status failed. Reason: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (checked: boolean) => {
    const previous = enabled();
    setEnabled(checked);
    setLoading(true);

    try {
      await (checked ? enable() : disable());
      setEnabled(await isEnabled());
      props.notify(
        `Auto launch ${checked ? 'enabled' : 'disabled'} successfully.`,
      );
    } catch (error) {
      setEnabled(previous);
      props.notify(
        `Auto launch ${checked ? 'enabled' : 'disabled'} failed. Reason: ${error}`,
        'error',
      );
    } finally {
      setLoading(false);
    }
  };

  onMount(refresh);

  return (
    <label class="relative inline-flex h-6 w-11 items-center">
      <input
        aria-label="Auto Launch"
        checked={enabled()}
        class="peer sr-only"
        disabled={loading()}
        type="checkbox"
        onChange={(event) => handleToggle(event.currentTarget.checked)}
      />
      <span class="h-6 w-11 rounded-full border border-transparent bg-border shadow-inner transition-colors peer-checked:bg-primary peer-disabled:opacity-60" />
      <span class="pointer-events-none absolute left-1 h-4 w-4 rounded-full bg-card shadow transition-transform peer-checked:translate-x-5" />
    </label>
  );
}

function VolumeSetting(props: { notify: Notify }) {
  const [volume, setVolume] = createSignal(100);
  const [loading, setLoading] = createSignal(true);
  let saveTimer: number | undefined;

  const refresh = async () => {
    setLoading(true);
    try {
      setVolume(Math.round(unwrapCommand(await commands.getVolume()) * 100));
    } catch (error) {
      props.notify(`Volume load failed. Reason: ${error}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveVolume = async (nextVolume: number) => {
    try {
      const result = await commands.updateVolume(nextVolume / 100);
      unwrapCommand(result);
      props.notify(`Volume changed successfully to ${nextVolume}.`);
    } catch (error) {
      props.notify(`Volume change failed. Reason: ${error}`, 'error');
      await refresh();
    }
  };

  const handleInput = (nextVolume: number) => {
    setVolume(nextVolume);
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveVolume, 350, nextVolume);
  };

  onMount(refresh);
  onCleanup(() => window.clearTimeout(saveTimer));

  return (
    <div class="flex min-w-0 items-center gap-3">
      <span class="w-10 text-right text-sm tabular-nums text-muted-foreground">
        {volume()}
      </span>
      <input
        aria-label="Volume"
        class="volume-range h-4 w-36 cursor-pointer appearance-none bg-transparent disabled:opacity-60"
        disabled={loading()}
        max="100"
        min="0"
        style={{ '--volume-progress': `${volume()}%` }}
        step="1"
        type="range"
        value={volume()}
        onInput={(event) => handleInput(Number(event.currentTarget.value))}
      />
    </div>
  );
}

function SoundSetting(props: { notify: Notify }) {
  const [downloadOpen, setDownloadOpen] = createSignal(false);
  const [sounds, soundControls] = createResource(loadSounds);
  const [selectedSound, selectedSoundControls] =
    createResource(loadSelectedSound);

  const soundList = createMemo(() => sounds() ?? []);
  const hasSounds = createMemo(() => soundList().length > 0);
  const existedSoundNames = createMemo(() =>
    soundList().map((sound) => sound.name),
  );

  const handleSelect = async (sound: string) => {
    if (!sound) {
      return;
    }

    selectedSoundControls.mutate(sound);

    const result = await commands.selectSound(sound);
    if (result.status === 'error') {
      props.notify(
        'Your selected sound needs an update. Please re-download it.',
        'error',
      );
    } else {
      const soundItem = soundList().find((item) => item.value === sound);
      props.notify(
        `'${displaySoundName(soundItem?.name ?? 'Sound')}' chosen successfully.`,
      );
    }

    await selectedSoundControls.refetch();
  };

  const status = () => {
    if (sounds.loading) {
      return 'LOADING PACKS…';
    }
    if (sounds.error) {
      return 'PACK LIST UNAVAILABLE';
    }
    if (!hasSounds()) {
      return 'NO PACKS · DOWNLOAD TO START';
    }
    if (!selectedSound()) {
      return 'SELECT A PACK TO ARM IT';
    }
    return 'TYPE ANYWHERE TO HEAR IT';
  };

  return (
    <div class="space-y-3">
      <div class="flex items-baseline justify-between gap-4">
        <span class="mono-label mono-red">Sound Pack</span>
        <span aria-live="polite" class="mono-label">
          {status()}
        </span>
      </div>

      <select
        aria-label="Sound"
        class="ui-field select-field w-full"
        disabled={sounds.loading || !hasSounds()}
        value={selectedSound() ?? ''}
        onChange={(event) => handleSelect(event.currentTarget.value)}
      >
        <option disabled value="">
          {hasSounds() ? 'Select a pack' : 'No packs installed yet'}
        </option>
        <For each={soundList()}>
          {(sound) => (
            <option value={sound.value}>{displaySoundName(sound.name)}</option>
          )}
        </For>
      </select>

      <div class="flex items-center justify-between gap-4">
        <Show fallback={<span />} when={sounds.error}>
          <p class="text-sm text-destructive">Sound list failed to load.</p>
        </Show>
        <button
          class={`${hasSounds() ? 'secondary-button' : 'primary-button'} shrink-0`}
          disabled={sounds.loading}
          type="button"
          onClick={() => setDownloadOpen(true)}
        >
          Browse packs…
        </button>
      </div>

      <DownloadDialog
        existedSoundNames={existedSoundNames()}
        notify={props.notify}
        open={downloadOpen()}
        onClose={() => setDownloadOpen(false)}
        onDownloaded={async () => {
          await soundControls.refetch();
        }}
      />
    </div>
  );
}

function DownloadDialog(props: {
  existedSoundNames: string[];
  notify: Notify;
  open: boolean;
  onClose: () => void;
  onDownloaded: () => Promise<void>;
}) {
  const [onlineSounds, setOnlineSounds] = createSignal<OnlineSound[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loadingError, setLoadingError] = createSignal<string | null>(null);
  const [downloadingName, setDownloadingName] = createSignal<string | null>(
    null,
  );
  let requestId = 0;

  const loadOnlineSoundList = async () => {
    const currentRequestId = ++requestId;
    setLoading(true);
    setLoadingError(null);

    try {
      const parsed = await loadOnlineSounds();
      if (currentRequestId === requestId) {
        setOnlineSounds(parsed);
      }
    } catch (error) {
      if (currentRequestId === requestId) {
        setLoadingError(String(error));
      }
    } finally {
      if (currentRequestId === requestId) {
        setLoading(false);
      }
    }
  };

  const handleDownload = async (sound: OnlineSound) => {
    setDownloadingName(sound.name);

    try {
      const result = await commands.downloadSound(sound.downloadUrl);
      unwrapCommand(result);
      props.notify('Download successful.');
      await props.onDownloaded();
    } catch (error) {
      props.notify(`Download failed. Reason: ${error}`, 'error');
    } finally {
      setDownloadingName(null);
    }
  };

  createEffect(() => {
    if (props.open) {
      void loadOnlineSoundList();
    }
  });

  return (
    <Show when={props.open}>
      <div
        class="dialog-backdrop"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            props.onClose();
          }
        }}
      >
        <section class="dialog-panel">
          <header class="dialog-header">
            <h2 class="dialog-title">Browse packs</h2>
            <button
              aria-label="Close"
              class="icon-button"
              type="button"
              onClick={props.onClose}
            >
              <span aria-hidden="true" class="close-icon" />
            </button>
          </header>

          <div class="dialog-body">
            <Show
              fallback={
                <For
                  each={onlineSounds()}
                  fallback={
                    <div class="dialog-state">No packs found online.</div>
                  }
                >
                  {(sound) => {
                    const isExisted = () =>
                      props.existedSoundNames.some((name) =>
                        sound.id.startsWith(name),
                      );
                    const isDownloading = () =>
                      downloadingName() === sound.name;

                    return (
                      <div class="sound-download-row">
                        <span class="sound-download-name" title={sound.name}>
                          {displaySoundName(sound.name)}
                        </span>
                        <button
                          class={`${isExisted() ? 'secondary-button' : 'primary-button'} sound-download-action`}
                          disabled={downloadingName() !== null}
                          type="button"
                          onClick={() => handleDownload(sound)}
                        >
                          <Show
                            fallback={isExisted() ? 'Redownload' : 'Download'}
                            when={isDownloading()}
                          >
                            Saving...
                          </Show>
                        </button>
                      </div>
                    );
                  }}
                </For>
              }
              when={loading()}
            >
              <div class="dialog-state">Loading...</div>
            </Show>

            <Show when={loadingError()}>
              <p class="dialog-state dialog-state-error">
                Online sounds failed to load.
              </p>
            </Show>
          </div>

          <footer class="dialog-footer">
            <button
              class="secondary-button"
              type="button"
              onClick={props.onClose}
            >
              Close
            </button>
          </footer>
        </section>
      </div>
    </Show>
  );
}

function SettingRow(props: { label: string; children: JSX.Element }) {
  return (
    <div class="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-2">
      <span class="mono-label">{props.label}</span>
      <div class="min-w-0">{props.children}</div>
    </div>
  );
}

function ProjectUpdateCard(props: { notify: Notify; onDismiss: () => void }) {
  return (
    <section class="project-update">
      <div class="min-w-0">
        <p class="project-update-kicker">v{APP_VERSION}</p>
        <h3 class="project-update-title">
          KeyEcho is back — shape its first packs
        </h3>
        <p class="project-update-copy">
          Rebuilt on Tauri 2 with signed builds for every platform — still free
          and open source. Studio-recorded packs are next: your vote decides
          what gets recorded first.
        </p>
      </div>

      <div class="project-update-actions">
        <button
          class="primary-button project-update-button"
          type="button"
          onClick={() => openExternalUrl(KEYECHO_VOTE_URL, props.notify)}
        >
          Vote packs
        </button>
      </div>

      <button
        aria-label="Hide update"
        class="icon-button"
        type="button"
        onClick={props.onDismiss}
      >
        <span aria-hidden="true" class="close-icon" />
      </button>
    </section>
  );
}

export default function App() {
  const notifier = createNotifier();
  const [projectUpdateVisible, setProjectUpdateVisible] = createSignal(
    !hasDismissedProjectUpdate(),
  );

  onMount(() => {
    window.setTimeout(
      () => void checkForAppUpdate(notifier.notify),
      APP_UPDATE_CHECK_DELAY_MS,
    );
  });

  const showProjectUpdate = () => {
    forgetProjectUpdateDismissed();
    setProjectUpdateVisible(true);
  };

  const dismissProjectUpdate = () => {
    rememberProjectUpdateDismissed();
    setProjectUpdateVisible(false);
  };

  return (
    <>
      <main class="flex h-full flex-col overflow-y-auto bg-background p-4 text-foreground">
        <section class="app-card mx-auto my-auto max-w-xl">
          <header class="card-hdr">
            <img alt="" class="h-6 w-6" src={iconUrl} />
            <h1 class="text-[0.9375rem] font-semibold tracking-tight">
              KeyEcho
            </h1>
            <div class="ml-auto">
              <Show when={!projectUpdateVisible()}>
                <button
                  class="secondary-button whats-new-button"
                  type="button"
                  onClick={showProjectUpdate}
                >
                  What's New
                </button>
              </Show>
            </div>
          </header>

          <div class="px-5 py-3">
            <SoundSetting notify={notifier.notify} />
          </div>

          <div class="divide-y divide-border border-t border-border px-5">
            <SettingRow label="Auto Launch">
              <AutoLaunchSetting notify={notifier.notify} />
            </SettingRow>

            <SettingRow label="Volume">
              <VolumeSetting notify={notifier.notify} />
            </SettingRow>
          </div>

          <Show when={projectUpdateVisible()}>
            <ProjectUpdateCard
              notify={notifier.notify}
              onDismiss={dismissProjectUpdate}
            />
          </Show>

          <footer class="card-foot">
            <span class="mono-label">Tauri + Rust · Under 5 MB · AGPL-3.0</span>
            <button
              class="mono-label card-foot-link"
              type="button"
              onClick={() =>
                openExternalUrl('https://keyecho.app', notifier.notify)
              }
            >
              keyecho.app
            </button>
          </footer>
        </section>
      </main>

      <Toasts removeToast={notifier.removeToast} toasts={notifier.toasts} />
    </>
  );
}
