import type { JSX } from 'solid-js';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import type { InferOutput } from 'valibot';
import {
  array,
  boolean,
  literal,
  number,
  object,
  optional,
  parseAsync,
  pipe,
  string,
  url,
} from 'valibot';

import iconUrl from '../src-tauri/icons/Square71x71Logo.png';
import { startBuyFlow, startPackBuyFlow } from './buy';
import { activationKey, initDeepLinks } from './deeplink';
import { KEYECHO_ORIGIN } from './origin';
import { previewPack } from './preview';
import type { CommandResult, SoundOption } from './services/bindings';
import { commands } from './services/bindings';

// v1.1: schemaVersion-2 catalog (free + paid). No GitHub fallback.
const PACK_CATALOG_URL = `${KEYECHO_ORIGIN}/packs/catalog.json`;

const APP_VERSION = '1.1.0';
const PROJECT_UPDATE_DISMISSED_KEY = `keyecho:v${APP_VERSION}:update-dismissed-session`;

const LICENSE_KEY_STORAGE = 'keyecho:license-key';
const ENTITLEMENTS_URL = `${KEYECHO_ORIGIN}/packs/entitlements`;
const PACK_DOWNLOAD_URL = `${KEYECHO_ORIGIN}/packs/download`;
const RESTORE_URL = `${KEYECHO_ORIGIN}/packs/restore`;

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
    .replace(/^waveapp-/, '') // catalog packIds carry a vendor prefix
    .split('-')
    .map(
      (word) =>
        SOUND_NAME_TOKENS[word] ??
        (word ? word[0].toUpperCase() + word.slice(1) : word),
    )
    .join(' ');
}

const PackCatalogSchema = object({
  schemaVersion: literal(2),
  packs: array(
    object({
      id: string(),
      name: string(),
      slug: string(),
      tier: string(),
      priceUsd: number(),
      downloadUrl: optional(pipe(string(), url())),
    }),
  ),
});

const EntitlementsSchema = object({
  valid: boolean(),
  packs: optional(array(string())),
});

type PackCatalog = InferOutput<typeof PackCatalogSchema>;

interface OnlineSound {
  downloadUrl?: string; // free packs only; paid ones are bought on the web
  id: string;
  name: string;
  slug: string;
  tier: string;
  priceUsd: number;
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

// Installed packs are folders named by slug (crisp-click-bright), but the store
// sells them under a shorter marketing name (Crisp Click). Resolve through the
// catalog so both surfaces agree; imported v1 packs aren't in it and keep the
// name derived from their folder.
let catalogNameCache: Map<string, string> | null = null;

async function catalogNames(): Promise<Map<string, string>> {
  if (!catalogNameCache) {
    try {
      catalogNameCache = new Map(
        (await loadOnlineSounds()).map((pack) => [pack.id, pack.name]),
      );
    } catch {
      catalogNameCache = new Map(); // offline -> derived names still work
    }
  }
  return catalogNameCache;
}

/** Display name for a pack id, usable outside async context. */
function packLabel(id: string): string {
  return catalogNameCache?.get(id) ?? displaySoundName(id);
}

type InstalledSound = SoundOption & { pressOnly: boolean; label: string };

async function loadSounds(): Promise<InstalledSound[]> {
  const [sounds, pressOnly] = await Promise.all([
    commands.getSounds(),
    commands.pressOnlyPacks(),
  ]);
  const legacy = new Set(unwrapCommand(pressOnly));
  const names = await catalogNames();
  return unwrapCommand(sounds).map((sound) => ({
    ...sound,
    pressOnly: legacy.has(sound.value),
    label: names.get(sound.name) ?? displaySoundName(sound.name),
  }));
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

function mapPackCatalog(catalog: PackCatalog): OnlineSound[] {
  // Every released pack is listed so paid ones are discoverable in-app: free
  // packs carry a downloadUrl (direct CDN), paid ones send you to the web store.
  return (
    catalog.packs
      .map((pack) => ({
        downloadUrl: pack.downloadUrl,
        id: pack.id,
        name: pack.name,
        slug: pack.slug,
        tier: pack.tier,
        priceUsd: pack.priceUsd,
      }))
      // Free first (the try-it hook), then paid; each group alphabetical.
      .sort((a, b) => {
        const aFree = a.tier === 'free' ? 0 : 1;
        const bFree = b.tier === 'free' ? 0 : 1;
        return aFree - bFree || a.name.localeCompare(b.name);
      })
  );
}

async function loadOfficialOnlineSounds(): Promise<OnlineSound[]> {
  return mapPackCatalog(
    await parseAsync(PackCatalogSchema, await fetchJson(PACK_CATALOG_URL)),
  );
}

async function loadOnlineSounds(): Promise<OnlineSound[]> {
  return loadOfficialOnlineSounds();
}

function loadStoredLicenseKey(): string {
  try {
    return localStorage.getItem(LICENSE_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function storeLicenseKey(key: string) {
  try {
    if (key) {
      localStorage.setItem(LICENSE_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(LICENSE_KEY_STORAGE);
    }
  } catch {
    // A missing persisted key only means the user re-pastes it next launch.
  }
}

function entitlementsUrl(key: string): string {
  const url = new URL(ENTITLEMENTS_URL);
  url.searchParams.set('key', key);
  return url.toString();
}

function packDownloadUrl(key: string, packId: string): string {
  const url = new URL(PACK_DOWNLOAD_URL);
  url.searchParams.set('key', key);
  url.searchParams.set('pack', packId);
  return url.toString();
}

async function fetchEntitledPacks(key: string): Promise<string[]> {
  const data = await parseAsync(
    EntitlementsSchema,
    await fetchJson(entitlementsUrl(key)),
  );
  if (!data.valid) {
    throw new Error('invalid-key');
  }
  return data.packs ?? [];
}

/**
 * Persist a licence key and install every entitled pack that isn't installed.
 *
 * Module scope on purpose: a keyecho://activate deep link has to work whether or
 * not the License dialog happens to be mounted. Returns the entitled pack ids.
 */
async function activateLicense(
  key: string,
  notify: Notify,
  onInstalled?: () => void,
): Promise<{ entitled: string[]; installed: string[] }> {
  const packs = await fetchEntitledPacks(key);
  storeLicenseKey(key);

  const already = new Set((await loadSounds()).map((sound) => sound.name));
  const installed: string[] = [];
  for (const packId of packs) {
    if (already.has(packId)) {
      continue;
    }
    try {
      unwrapCommand(await commands.downloadSound(packDownloadUrl(key, packId)));
      installed.push(packId);
      notify(`'${packLabel(packId)}' downloaded.`);
      // Refresh per pack, not once at the end: downloads take seconds, and
      // waiting for the whole batch makes the list look stale after activation.
      onInstalled?.();
    } catch (error) {
      // One failure shouldn't abort the rest of the purchase.
      notify(`Download failed. Reason: ${error}`, 'error');
    }
  }
  return { entitled: packs, installed };
}

/** Arm a pack by id right after install, so a one-pack purchase is audible at
 *  once. Returns false when the pack isn't in the installed list (yet). */
async function selectPackById(packId: string): Promise<boolean> {
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
      setEnabled(unwrapCommand(await commands.isAutoLaunchEnabled()));
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
      unwrapCommand(await commands.setAutoLaunch(checked));
      setEnabled(unwrapCommand(await commands.isAutoLaunchEnabled()));
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

function SoundSetting(props: { notify: Notify; reloadSignal: () => number }) {
  const [downloadOpen, setDownloadOpen] = createSignal(false);
  const [sounds, soundControls] = createResource(loadSounds);
  const [selectedSound, selectedSoundControls] =
    createResource(loadSelectedSound);

  // Refetch when packs change elsewhere (licence key, deep link). The selection
  // can change too — a deep link arms the pack it just installed — so pull both,
  // otherwise the dropdown keeps showing the previous pack.
  createEffect(
    on(
      props.reloadSignal,
      () => {
        void soundControls.refetch();
        void selectedSoundControls.refetch();
      },
      { defer: true },
    ),
  );

  const soundList = createMemo(() => sounds() ?? []);
  const hasSounds = createMemo(() => soundList().length > 0);
  const existedSoundNames = createMemo(() =>
    soundList().map((sound) => sound.name),
  );

  const [preparing, setPreparing] = createSignal(false);
  const handleSelect = async (sound: string) => {
    if (!sound) {
      return;
    }

    selectedSoundControls.mutate(sound);

    // Selecting decodes the whole pack in Rust, which takes a moment — without
    // this the panel looks idle and the audition seems to fire late.
    setPreparing(true);
    try {
      const result = await commands.selectSound(sound);
      if (result.status === 'error') {
        props.notify(
          'Your selected sound needs an update. Please re-download it.',
          'error',
        );
      } else {
        const soundItem = soundList().find((item) => item.value === sound);
        props.notify(`'${soundItem?.label ?? 'Sound'}' chosen successfully.`);
        void commands.previewPackSound(); // audition the pack so you hear what you picked
      }
    } finally {
      setPreparing(false);
    }

    await selectedSoundControls.refetch();
  };

  const [importing, setImporting] = createSignal(false);
  // Only mention importing when v1 packs actually exist on this machine.
  const [legacyCount, legacyControls] = createResource(async () => {
    const result = await commands.legacyPacksAvailable();
    return result.status === 'ok' ? result.data : 0;
  });
  const hasLegacy = () => (legacyCount() ?? 0) > 0;
  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await commands.importSoundPack();
      if (result.status === 'error') {
        props.notify('Could not import your previous packs.', 'error');
        return;
      }
      if (result.data.length === 0) {
        props.notify('No packs found from a previous KeyEcho version.');
        return;
      }
      await Promise.all([soundControls.refetch(), legacyControls.refetch()]);
      props.notify(
        `Imported ${result.data.length} v1 pack${result.data.length > 1 ? 's' : ''}. These play a press sound only — packs from Browse also have a key-up sound.`,
      );
    } finally {
      setImporting(false);
    }
  };

  const status = () => {
    if (preparing()) {
      return 'PREPARING SOUND…';
    }
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

      <Show
        fallback={
          // Empty bay: same footprint as the loaded selector, so the panel keeps
          // its height and its left-aligned grid instead of a centered block.
          <div class="space-y-3">
            {/* Same bordered field the selector will be — reads as "this is
                where a pack goes", just empty. */}
            <div class="ui-field pack-empty-field w-full">No pack loaded</div>

            {/* Upgrading from v1 is the one case where the app looks broken
                ("my sounds are gone"), so say so plainly and lead with the fix. */}
            <Show when={hasLegacy()}>
              <p class="pack-recover-note">
                Upgrading from KeyEcho v1? Your {legacyCount()} pack
                {legacyCount() === 1 ? '' : 's'} are still on this Mac.
              </p>
            </Show>

            <div class="flex items-center justify-between gap-4">
              <Show fallback={<span />} when={hasLegacy()}>
                <button
                  class="secondary-button shrink-0"
                  disabled={importing()}
                  type="button"
                  onClick={handleImport}
                >
                  {importing()
                    ? 'Importing…'
                    : `Import ${legacyCount()} v1 pack${legacyCount() === 1 ? '' : 's'}`}
                </button>
              </Show>
              <button
                class="primary-button shrink-0"
                disabled={sounds.loading}
                type="button"
                onClick={() => setDownloadOpen(true)}
              >
                Browse packs
              </button>
            </div>
          </div>
        }
        when={hasSounds()}
      >
        <select
          aria-busy={preparing()}
          aria-label="Sound"
          class="ui-field select-field w-full"
          classList={{ 'is-preparing': preparing() }}
          disabled={sounds.loading || preparing()}
          value={selectedSound() ?? ''}
          onChange={(event) => handleSelect(event.currentTarget.value)}
        >
          <option disabled value="">
            Select a pack
          </option>
          <For each={soundList()}>
            {(sound) => (
              <option value={sound.value}>
                {sound.label}
                {sound.pressOnly ? ' · press only (v1)' : ''}
              </option>
            )}
          </For>
        </select>

        <div class="flex items-center justify-between gap-4">
          <Show fallback={<span />} when={sounds.error}>
            <p class="text-sm text-destructive">Sound list failed to load.</p>
          </Show>
          <div class="flex shrink-0 items-center gap-2">
            <Show when={hasLegacy()}>
              <button
                class="secondary-button shrink-0"
                disabled={importing()}
                title="One-off: bring in your packs from KeyEcho v1. They play a press sound only — no key-up sound. Nothing is uploaded."
                type="button"
                onClick={handleImport}
              >
                {importing() ? 'Importing…' : `Import v1 (${legacyCount()})`}
              </button>
            </Show>
            <button
              class="secondary-button shrink-0"
              disabled={sounds.loading}
              type="button"
              onClick={() => setDownloadOpen(true)}
            >
              Browse packs…
            </button>
          </div>
        </div>
      </Show>

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
    if (!sound.downloadUrl) {
      return;
    }
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

  const handlePreview = async (sound: OnlineSound) => {
    try {
      await previewPack(sound.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error('[keyecho] preview failed', sound.id, error);
      props.notify(`Preview failed (${sound.id}): ${reason}`, 'error');
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

                    const isPaid = () => sound.tier !== 'free';

                    return (
                      <div class="sound-download-row has-preview">
                        <button
                          aria-label={`Preview ${sound.name}`}
                          class="secondary-button sound-preview-action"
                          title="Hear a few keys"
                          type="button"
                          onClick={() => handlePreview(sound)}
                        >
                          ▶
                        </button>
                        {/* Already the catalog's marketing name — don't run it
                            through the slug deriver, which splits on hyphens. */}
                        <span class="sound-download-name" title={sound.name}>
                          {sound.name}
                        </span>
                        <span class="mono-label sound-download-price">
                          {isPaid() ? `$${sound.priceUsd.toFixed(2)}` : 'FREE'}
                        </span>
                        <Show
                          fallback={
                            // Already installed = already bought. Re-downloading
                            // a paid pack needs the licence key, so that lives in
                            // the License dialog, not here — state, not action.
                            <Show
                              fallback={
                                <span class="mono-label sound-download-owned">
                                  Installed
                                </span>
                              }
                              when={!isExisted()}
                            >
                              <button
                                class="secondary-button sound-download-action"
                                type="button"
                                onClick={() =>
                                  void startPackBuyFlow(
                                    sound.slug,
                                    props.notify,
                                  )
                                }
                              >
                                Get
                              </button>
                            </Show>
                          }
                          when={!isPaid()}
                        >
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
                        </Show>
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

// License lives in a dialog off the header — it's a rare, paid-only errand, so
// it shouldn't take permanent space in a panel most users never buy from.
function LicenseDialog(props: {
  notify: Notify;
  open: boolean;
  onClose: () => void;
  onSoundsChanged: () => void;
}) {
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
            <h2 class="dialog-title">License</h2>
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
            <div class="px-4 py-4">
              <LicenseSetting
                notify={props.notify}
                onSoundsChanged={props.onSoundsChanged}
              />
            </div>
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

function LicenseSetting(props: {
  notify: Notify;
  onSoundsChanged: () => void;
}) {
  const [key, setKey] = createSignal(loadStoredLicenseKey());
  const [entitled, setEntitled] = createSignal<string[] | null>(null);
  const [checking, setChecking] = createSignal(false);
  const [checkError, setCheckError] = createSignal<string | null>(null);
  const [downloadingPack, setDownloadingPack] = createSignal<string | null>(
    null,
  );
  const [restoreOpen, setRestoreOpen] = createSignal(false);
  const [restoreEmail, setRestoreEmail] = createSignal('');
  const [restoring, setRestoring] = createSignal(false);
  const [installed, installedControls] = createResource(async () => {
    return new Set((await loadSounds()).map((sound) => sound.name));
  });

  const isInstalled = (packId: string) => installed()?.has(packId) ?? false;

  const download = async (packId: string) => {
    setDownloadingPack(packId);
    try {
      unwrapCommand(
        await commands.downloadSound(packDownloadUrl(key().trim(), packId)),
      );
      await installedControls.refetch();
      props.onSoundsChanged();
      props.notify(`'${packLabel(packId)}' downloaded.`);
    } catch (error) {
      props.notify(`Download failed. Reason: ${error}`, 'error');
    } finally {
      setDownloadingPack(null);
    }
  };

  const check = async () => {
    const trimmed = key().trim();
    if (!trimmed) {
      setCheckError('Enter your license key.');
      setEntitled(null);
      return;
    }

    setChecking(true);
    setCheckError(null);
    try {
      const { entitled } = await activateLicense(trimmed, props.notify, () => {
        void installedControls.refetch();
        props.onSoundsChanged();
      });
      setEntitled(entitled);
      setKey(trimmed);
      props.notify(
        entitled.length
          ? `License restored — ${entitled.length} pack${entitled.length === 1 ? '' : 's'} available.`
          : 'License valid, but no packs are entitled yet.',
      );
      await installedControls.refetch();
      props.onSoundsChanged();
    } catch (error) {
      setEntitled(null);
      setCheckError(
        error instanceof Error && error.message === 'invalid-key'
          ? 'License key not recognized.'
          : `Could not reach the license server. Reason: ${error}`,
      );
    } finally {
      setChecking(false);
    }
  };

  const forget = () => {
    storeLicenseKey('');
    setKey('');
    setEntitled(null);
    setCheckError(null);
  };

  // Restore-by-email: the endpoint never reveals whether the address had
  // purchases, so any completed request shows the same confirmation; only a
  // network failure is surfaced as an error.
  const restore = async () => {
    const email = restoreEmail().trim();
    if (!email) {
      return;
    }
    setRestoring(true);
    try {
      await fetch(RESTORE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      props.notify('Check your email — we sent your key(s).');
      setRestoreOpen(false);
      setRestoreEmail('');
    } catch {
      props.notify(
        "Couldn't reach the server. Try again in a moment.",
        'error',
      );
    } finally {
      setRestoring(false);
    }
  };

  onMount(() => {
    if (key().trim()) {
      void check();
    }
  });

  return (
    <div class="space-y-3">
      <div class="flex items-baseline justify-between gap-4">
        <span class="mono-label mono-red">License Key</span>
        <Show when={entitled() !== null}>
          <button
            class="mono-label card-foot-link"
            type="button"
            onClick={forget}
          >
            Forget key
          </button>
        </Show>
      </div>

      <form
        class="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void check();
        }}
      >
        <input
          aria-label="License key"
          autocomplete="off"
          class="ui-field w-full"
          placeholder="KE1.…"
          spellcheck={false}
          value={key()}
          onInput={(event) => setKey(event.currentTarget.value)}
        />
        <button
          class="primary-button shrink-0"
          disabled={checking()}
          type="submit"
        >
          <Show fallback="Restore" when={checking()}>
            Checking…
          </Show>
        </button>
      </form>

      <Show when={checkError()}>
        <p class="text-sm text-destructive">{checkError()}</p>
      </Show>

      <div>
        <button
          class="mono-label card-foot-link"
          type="button"
          onClick={() => setRestoreOpen((open) => !open)}
        >
          Lost your key? Restore by email
        </button>
        <Show when={restoreOpen()}>
          <form
            class="mt-2 flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void restore();
            }}
          >
            <input
              aria-label="Email for restore"
              autocomplete="email"
              class="ui-field w-full"
              placeholder="you@example.com"
              type="email"
              value={restoreEmail()}
              onInput={(event) => setRestoreEmail(event.currentTarget.value)}
            />
            <button
              class="primary-button shrink-0"
              disabled={restoring()}
              type="submit"
            >
              <Show fallback="Send" when={restoring()}>
                Sending…
              </Show>
            </button>
          </form>
        </Show>
      </div>

      <Show when={entitled()}>
        {(packs) => (
          <Show
            fallback={
              <p class="mono-label">No packs entitled to this key yet.</p>
            }
            when={packs().length > 0}
          >
            {/* Rows sit flush like the browse dialog's: the separator is a
                border-top between adjacent rows, so a gap here would leave the
                hairline floating. */}
            <div>
              <For each={packs()}>
                {(packId) => (
                  <div class="sound-download-row">
                    <span class="sound-download-name" title={packId}>
                      {packLabel(packId)}
                    </span>
                    <button
                      class={`${isInstalled(packId) ? 'secondary-button' : 'primary-button'} sound-download-action`}
                      disabled={downloadingPack() !== null}
                      type="button"
                      onClick={() => download(packId)}
                    >
                      <Show
                        fallback={
                          isInstalled(packId) ? 'Redownload' : 'Download'
                        }
                        when={downloadingPack() === packId}
                      >
                        Saving…
                      </Show>
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        )}
      </Show>
    </div>
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
        <h3 class="project-update-title">New sound catalog</h3>
        <p class="project-update-copy">
          A growing catalog of carefully crafted packs, free and paid. Preview
          any of them in your browser, then unlock the ones you like with a
          license key.
        </p>
      </div>

      <div class="project-update-actions">
        <button
          class="primary-button project-update-button"
          type="button"
          onClick={() => void startBuyFlow(props.notify)}
        >
          Browse packs
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
  const [soundsVersion, setSoundsVersion] = createSignal(0);
  // Paid-only: keep the license box out of free users' way behind a toggle.
  const [licenseOpen, setLicenseOpen] = createSignal(false);

  // Deep-link activation lives here, not in LicenseSetting: that component only
  // mounts while the License dialog is open, so a keyecho://activate link
  // arriving with the dialog closed used to activate but install nothing.
  createEffect(
    on(
      activationKey,
      (incoming) => {
        const trimmed = incoming?.trim();
        if (!trimmed) {
          return;
        }
        const refresh = () => setSoundsVersion((value) => value + 1);
        void activateLicense(trimmed, notifier.notify, refresh)
          .then(async ({ entitled }) => {
            refresh();
            // You just bought this and clicked "Open in KeyEcho" — arm it rather
            // than making you hunt for it. On a bundle this is the pack you
            // picked first, which beats leaving nothing selected.
            const first = entitled[0];
            if (first && (await selectPackById(first))) {
              refresh();
            }
          })
          .catch((error: unknown) => {
            notifier.notify(
              `Could not activate that key. Reason: ${error}`,
              'error',
            );
          });
      },
      { defer: true },
    ),
  );
  const [projectUpdateVisible, setProjectUpdateVisible] = createSignal(
    !hasDismissedProjectUpdate(),
  );

  const showProjectUpdate = () => {
    forgetProjectUpdateDismissed();
    setProjectUpdateVisible(true);
  };

  const dismissProjectUpdate = () => {
    rememberProjectUpdateDismissed();
    setProjectUpdateVisible(false);
  };

  onMount(() => void initDeepLinks(notifier.notify));

  return (
    <>
      <main class="flex h-full flex-col overflow-y-auto bg-background p-4 text-foreground">
        <section class="app-card mx-auto my-auto max-w-xl">
          <header class="card-hdr">
            <img alt="" class="h-6 w-6" src={iconUrl} />
            <h1 class="text-[0.9375rem] font-semibold tracking-tight">
              KeyEcho
            </h1>
            {/* License stays rightmost so it never shifts when What's New
                appears or is dismissed. */}
            <div class="ml-auto flex items-center gap-2">
              <Show when={!projectUpdateVisible()}>
                <button
                  class="secondary-button whats-new-button"
                  type="button"
                  onClick={showProjectUpdate}
                >
                  What's New
                </button>
              </Show>
              <button
                class="secondary-button whats-new-button"
                type="button"
                onClick={() => setLicenseOpen(true)}
              >
                License
              </button>
            </div>
          </header>

          <div class="px-5 py-3">
            <SoundSetting
              notify={notifier.notify}
              reloadSignal={soundsVersion}
            />
          </div>

          <div class="divide-y divide-border border-t border-border px-5">
            <SettingRow label="Auto Launch">
              <AutoLaunchSetting notify={notifier.notify} />
            </SettingRow>

            <SettingRow label="Volume">
              <VolumeSetting notify={notifier.notify} />
            </SettingRow>
          </div>

          <LicenseDialog
            notify={notifier.notify}
            open={licenseOpen()}
            onClose={() => setLicenseOpen(false)}
            onSoundsChanged={() => setSoundsVersion((value) => value + 1)}
          />

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
