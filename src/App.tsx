import type { JSX } from 'solid-js';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  createUniqueId,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { Portal } from 'solid-js/web';
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
import {
  cancelPurchase,
  pendingPurchase,
  startBuyFlow,
  startSoundTestFlow,
} from './buy';
import { activationKey, initDeepLinks } from './deeplink';
import type { Notify, Toast } from './notify';
import { KEYECHO_ORIGIN } from './origin';
import type { KeyPlayed } from './playback';
import { keyLabel, onKeyPlayed } from './playback';
import type { CommandResult, SoundOption } from './services/bindings';
import { commands } from './services/bindings';

// v1.1: schemaVersion-2 catalog (free + paid). No GitHub fallback.
const PACK_CATALOG_URL = `${KEYECHO_ORIGIN}/packs/catalog.json`;

const APP_VERSION = '1.1.1';
const UPDATE_TITLE = 'New sounds, safer licenses';
const UPDATE_DISMISSED_KEY = `keyecho:v${APP_VERSION}:update-dismissed`;

const LICENSE_KEY_STORAGE = 'keyecho:license-key';
const ENTITLEMENTS_URL = `${KEYECHO_ORIGIN}/packs/entitlements`;
const PACK_DOWNLOAD_URL = `${KEYECHO_ORIGIN}/packs/download`;
const RESTORE_URL = `${KEYECHO_ORIGIN}/packs/restore`;

const PREVIEW_BURST_MS = 1200;
// Same names and order as the site's catalog filter.
const CATEGORY_LABELS: Record<string, string> = {
  clicky: 'Clicky',
  thocky: 'Thocky',
  tactile: 'Tactile',
  linear: 'Linear',
  'silent-office': 'Silent office',
  typewriter: 'Typewriter',
  vintage: 'Vintage',
  fx: 'FX',
};
// Featured paid packs, most popular first.
const FEATURED_PAID = [
  'creamy-thock-smooth',
  'crisp-click-bright',
  'lecture-hall-laptop',
  'newsroom-typewriter',
  'arcade-key-blips',
];

// Pack lists are remote and grow over time, so display names come from token
// rules rather than a per-pack map: brand tokens that don't title-case cleanly
// are listed here, everything else is title-cased as-is.
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
      category: optional(string()),
      downloadUrl: optional(pipe(string(), url())),
    }),
  ),
});

const EntitlementsSchema = object({
  valid: boolean(),
  packs: optional(array(string())),
});

type PackCatalog = InferOutput<typeof PackCatalogSchema>;

// Lucide outlines at 24x24. Meaning always comes from adjacent text or the
// control's aria-label, so the icon itself stays hidden from assistive tech.
const ICON_PATHS = {
  check: ['M20 6 9 17l-5-5'],
  play: ['M6 3l14 9-14 9V3z'],
  square: ['M5 5h14v14H5z'],
  loading: ['M12 3a9 9 0 1 0 9 9'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
} satisfies Record<string, string[]>;

function Icon(props: { name: keyof typeof ICON_PATHS }) {
  return (
    <svg
      aria-hidden="true"
      class="ui-icon"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="1.8"
      viewBox="0 0 24 24"
    >
      <For each={ICON_PATHS[props.name]}>{(path) => <path d={path} />}</For>
    </svg>
  );
}

interface OnlineSound {
  downloadUrl?: string; // free packs only; paid ones are bought on the web
  id: string;
  name: string;
  slug: string;
  tier: string;
  priceUsd: number;
  category?: string;
}

/** Pack counts for the offer banner, taken from the live catalog. */
interface CatalogCounts {
  free: number;
  paid: number;
}

const [catalogCounts, setCatalogCounts] = createSignal<CatalogCounts | null>(
  null,
);

function unwrapCommand<T>(result: CommandResult<T>): T {
  if (result.status === 'ok') {
    return result.data;
  }

  throw new Error(result.error);
}

// Installed packs are folders named by slug (crisp-click-bright), but the store
// sells them under a shorter marketing name (Crisp Click). Resolve through the
// catalog so both surfaces agree.
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

type InstalledSound = SoundOption & { label: string };

async function loadSounds(): Promise<InstalledSound[]> {
  const sounds = unwrapCommand(await commands.getSounds());
  const names = await catalogNames();
  return sounds.map((sound) => ({
    ...sound,
    label: names.get(sound.name) ?? displaySoundName(sound.name),
  }));
}

async function loadSelectedSound(): Promise<string | null> {
  return unwrapCommand(await commands.getSelectedSound());
}

async function openExternalUrl(url: string, notify: Notify) {
  const result = await commands.openExternalUrl(url);
  if (result.status === 'error') {
    notify("Link didn't open", { tone: 'error', details: result.error });
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

function mapPackCatalog(catalog: PackCatalog): OnlineSound[] {
  const packs = catalog.packs.map((pack) => ({
    downloadUrl: pack.downloadUrl,
    id: pack.id,
    name: pack.name,
    slug: pack.slug,
    tier: pack.tier,
    priceUsd: pack.priceUsd,
    category: pack.category,
  }));

  const paid = packs.filter((pack) => pack.tier !== 'free').length;
  setCatalogCounts({ free: packs.length - paid, paid });

  // Crafted packs lead, most-auditioned first; free packs follow. Rest alphabetical.
  const rank = (pack: { slug: string }) => {
    const index = FEATURED_PAID.indexOf(pack.slug);
    return index === -1 ? FEATURED_PAID.length : index;
  };
  return packs.sort((a, b) => {
    const aFree = a.tier === 'free' ? 1 : 0;
    const bFree = b.tier === 'free' ? 1 : 0;
    return aFree - bFree || rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

async function loadOnlineSounds(): Promise<OnlineSound[]> {
  return mapPackCatalog(
    await parseAsync(PackCatalogSchema, await fetchJson(PACK_CATALOG_URL)),
  );
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

function packDownloadUrl(packId: string): string {
  const url = new URL(PACK_DOWNLOAD_URL);
  url.searchParams.set('pack', packId);
  return url.toString();
}

async function fetchEntitledPacks(key: string): Promise<string[]> {
  const data = await parseAsync(
    EntitlementsSchema,
    await fetchJson(ENTITLEMENTS_URL, {
      headers: { Authorization: `Bearer ${key}` },
    }),
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
      unwrapCommand(await commands.downloadSound(packDownloadUrl(packId), key));
      installed.push(packId);
      // Refresh per pack, not once at the end: downloads take seconds, and
      // waiting for the whole batch makes the list look stale after activation.
      onInstalled?.();
    } catch (error) {
      // One failure shouldn't abort the rest of the purchase.
      notify(`${packLabel(packId)} didn't download`, {
        tone: 'error',
        details: String(error),
      });
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

function hasDismissedUpdate(): boolean {
  try {
    return localStorage.getItem(UPDATE_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberUpdateDismissed() {
  try {
    localStorage.setItem(UPDATE_DISMISSED_KEY, 'true');
  } catch {
    // Dismissal is only a comfort preference; failing to store it is harmless.
  }
}

function createNotifier() {
  const [toasts, setToasts] = createSignal<Toast[]>([]);

  const removeToast = (id: string) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  };

  const notify: Notify = (message, options) => {
    const id =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToasts((items) => [...items, { id, message, ...options }]);
    // A toast offering an action waits for it; the rest fade on their own.
    if (!options?.action) {
      window.setTimeout(removeToast, 2400, id);
    }
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
          <div
            class={`toast-card ${toast.tone === 'error' ? 'toast-error' : ''}`}
          >
            <p class="toast-message">{toast.message}</p>
            <Show when={toast.details}>
              {(details) => (
                <details class="toast-details">
                  <summary>Details</summary>
                  <p>{details()}</p>
                </details>
              )}
            </Show>
            <div class="toast-actions">
              <Show when={toast.action}>
                {(action) => (
                  <button
                    class="link-button"
                    type="button"
                    onClick={() => {
                      props.removeToast(toast.id);
                      action().run();
                    }}
                  >
                    {action().label}
                  </button>
                )}
              </Show>
              <button
                aria-label="Dismiss notification"
                class="icon-button"
                type="button"
                onClick={() => props.removeToast(toast.id)}
              >
                <Icon name="x" />
              </button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function LevelMeter(props: { level: number }) {
  return (
    <span aria-hidden="true" class="level-meter">
      <For each={[1, 2, 3]}>
        {(step) => <i classList={{ 'is-lit': props.level >= step }} />}
      </For>
    </span>
  );
}

type StatusTone = 'ready' | 'none' | 'muted';

interface StatusModel {
  tone: StatusTone;
  name: string;
  detail?: string;
  level?: number;
  retry?: () => void;
}

function StatusBar(props: { status: StatusModel }) {
  return (
    <div aria-live="polite" class="status-bar">
      <span
        aria-hidden="true"
        class="status-dot"
        classList={{
          'is-off': props.status.tone === 'none',
          'is-muted': props.status.tone === 'muted',
        }}
      />
      <span class="status-name">{props.status.name}</span>
      <Show when={props.status.detail}>
        {(detail) => (
          <span class="status-detail">
            {detail()}
            <Show when={props.status.level !== undefined}>
              <LevelMeter level={props.status.level ?? 0} />
            </Show>
          </span>
        )}
      </Show>
      <Show when={props.status.retry}>
        {(retry) => (
          <button class="link-button" type="button" onClick={() => retry()()}>
            Retry
          </button>
        )}
      </Show>
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
      props.notify("Auto launch status didn't load", {
        tone: 'error',
        details: String(error),
      });
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
    } catch (error) {
      setEnabled(previous);
      props.notify("Auto launch didn't change", {
        tone: 'error',
        details: String(error),
        action: { label: 'Retry', run: () => void handleToggle(checked) },
      });
    } finally {
      setLoading(false);
    }
  };

  onMount(refresh);

  return (
    <label class="relative inline-flex h-6 w-11 items-center">
      <input
        aria-label="Auto launch"
        checked={enabled()}
        class="peer sr-only"
        disabled={loading()}
        type="checkbox"
        onChange={(event) => handleToggle(event.currentTarget.checked)}
      />
      <span class="h-6 w-11 cursor-pointer rounded-full border border-transparent bg-border shadow-inner transition-colors peer-checked:bg-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-60" />
      <span class="pointer-events-none absolute left-1 h-4 w-4 rounded-full bg-card shadow transition-transform peer-checked:translate-x-5" />
    </label>
  );
}

// Matches the backend clamp: past 150% the loudest pack clips.
const MAX_VOLUME = 150;

function VolumeSetting(props: {
  notify: Notify;
  volume: () => number;
  onVolume: (volume: number) => void;
}) {
  const [loading, setLoading] = createSignal(true);
  let saveTimer: number | undefined;

  const refresh = async () => {
    setLoading(true);
    try {
      props.onVolume(
        Math.round(unwrapCommand(await commands.getVolume()) * 100),
      );
    } catch (error) {
      props.notify("Volume didn't load", {
        tone: 'error',
        details: String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const saveVolume = async (nextVolume: number) => {
    try {
      unwrapCommand(await commands.updateVolume(nextVolume / 100));
    } catch (error) {
      props.notify("Volume didn't change", {
        tone: 'error',
        details: String(error),
        action: { label: 'Retry', run: () => void saveVolume(nextVolume) },
      });
      await refresh();
    }
  };

  const handleInput = (nextVolume: number) => {
    props.onVolume(nextVolume);
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveVolume, 350, nextVolume);
  };

  onMount(refresh);
  onCleanup(() => window.clearTimeout(saveTimer));

  return (
    <div class="volume-control">
      <span class="volume-value">{props.volume()}</span>
      <input
        aria-label="Volume"
        class="volume-range h-4 w-56 cursor-pointer appearance-none bg-transparent disabled:opacity-60"
        disabled={loading()}
        max={MAX_VOLUME}
        min="0"
        style={{
          '--volume-progress': `${(props.volume() / MAX_VOLUME) * 100}%`,
        }}
        step="1"
        type="range"
        value={props.volume()}
        onInput={(event) => handleInput(Number(event.currentTarget.value))}
      />
    </div>
  );
}

/** The app's one dropdown: the pack picker and the Browse packs filters. */
function SelectMenu(props: {
  label: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  placeholder?: string;
  disabled?: boolean;
  preparing?: boolean;
  onSelect: (value: string) => void;
}) {
  const menuId = createUniqueId();
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const [placement, setPlacement] = createSignal<JSX.CSSProperties>({});
  let root: HTMLDivElement | undefined;
  let menu: HTMLUListElement | undefined;

  const selected = () => props.options.find((o) => o.value === props.value);
  const optionId = (index: number) => `${menuId}-option-${index}`;

  const openMenu = () => {
    if (props.disabled || props.options.length === 0) {
      return;
    }
    const index = props.options.findIndex((o) => o.value === props.value);
    setActive(Math.max(index, 0));
    // Fixed to the window, so a scrolling dialog can't carry or clip it.
    const rect = root?.getBoundingClientRect();
    if (rect) {
      const gap = 12;
      const offset = 4;
      const below = window.innerHeight - rect.bottom - gap - offset;
      const above = rect.top - gap - offset;
      const up = below < 160 && above > below;
      setPlacement({
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        'max-height': `${Math.min(328, up ? above : below)}px`,
        ...(up
          ? { bottom: `${window.innerHeight - rect.top + offset}px` }
          : { top: `${rect.bottom + offset}px` }),
      });
    }
    setOpen(true);
  };

  const choose = (value: string) => {
    setOpen(false);
    if (value !== props.value) {
      props.onSelect(value);
    }
  };

  const move = (delta: number) => {
    const count = props.options.length;
    setActive((index) => (index + delta + count) % count);
    menu
      ?.querySelector(`#${optionId(active())}`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        move(-active());
        break;
      case 'End':
        event.preventDefault();
        move(props.options.length - 1 - active());
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const option = props.options[active()];
        if (option) {
          choose(option.value);
        }
        break;
      }
      case 'Escape':
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  createEffect(() => {
    if (!open()) {
      return;
    }
    const outside = (event: Event) =>
      !root?.contains(event.target as Node) &&
      !menu?.contains(event.target as Node);
    const onPointerDown = (event: PointerEvent) => {
      if (outside(event)) {
        setOpen(false);
      }
    };
    // Like a native select: scrolling anything behind the menu closes it.
    const onScroll = (event: Event) => {
      if (outside(event)) {
        setOpen(false);
      }
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    onCleanup(() => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    });
  });

  createEffect(() => {
    if (props.disabled) {
      setOpen(false);
    }
  });

  return (
    <div ref={root} class="pack-select">
      <button
        aria-activedescendant={open() ? optionId(active()) : undefined}
        aria-busy={props.preparing}
        aria-controls={menuId}
        aria-expanded={open()}
        aria-haspopup="listbox"
        aria-label={props.label}
        class="ui-field select-field pack-select-trigger w-full"
        classList={{ 'is-open': open(), 'is-preparing': props.preparing }}
        disabled={props.disabled}
        type="button"
        onClick={() => (open() ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span classList={{ 'pack-select-placeholder': !selected() }}>
          {selected()?.label ?? props.placeholder ?? ''}
        </span>
      </button>
      <Show when={open()}>
        <Portal>
          <ul
            ref={menu}
            aria-label={props.label}
            class="pack-select-menu"
            id={menuId}
            role="listbox"
            style={placement()}
          >
            <For each={props.options}>
              {(option, index) => (
                <li
                  aria-selected={option.value === props.value}
                  classList={{ 'is-active': index() === active() }}
                  id={optionId(index())}
                  role="option"
                  onClick={() => choose(option.value)}
                  onPointerMove={() => setActive(index())}
                >
                  <span>{option.label}</span>
                  <Show when={option.value === props.value}>
                    <Icon name="check" />
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Portal>
      </Show>
    </div>
  );
}

function SettingRow(props: { label: string; children: JSX.Element }) {
  return (
    <div class="box-border grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-2">
      <span class="mono-label">{props.label}</span>
      <div class="min-w-0">{props.children}</div>
    </div>
  );
}

function PackAction(props: {
  active: boolean;
  installed: boolean;
  sound: OnlineSound;
  downloading: boolean;
  notify: Notify;
  onDownload: () => void;
  onUse: () => void;
  openLicense: () => void;
}) {
  const isPaid = () => props.sound.tier !== 'free';

  return (
    <Show
      fallback={
        <Show
          fallback={
            <button
              class="secondary-button sound-download-action"
              disabled={props.downloading}
              type="button"
              onClick={props.onDownload}
            >
              <Show fallback="Download" when={props.downloading}>
                Saving…
              </Show>
            </button>
          }
          when={isPaid()}
        >
          {/* One purchase in this dialog: every paid row leads to the same
              offer as the banner. Single packs stay on their web pages. */}
          <button
            class="text-button sound-download-action"
            disabled={pendingPurchase() !== null}
            type="button"
            onClick={() =>
              void startBuyFlow(props.notify, props.openLicense, {
                campaign: 'pack_row',
                content: props.sound.slug,
              })
            }
          >
            Unlock all
          </button>
        </Show>
      }
      when={props.installed}
    >
      <Show
        fallback={
          <button
            class="secondary-button sound-download-action"
            type="button"
            onClick={props.onUse}
          >
            Use
          </button>
        }
        when={props.active}
      >
        <button
          class="secondary-button sound-download-action is-ghost"
          disabled
          type="button"
        >
          In use
        </button>
      </Show>
    </Show>
  );
}

function OfferBanner(props: { notify: Notify; openLicense: () => void }) {
  const counts = () => catalogCounts();
  const waiting = () => pendingPurchase()?.kind === 'all';

  return (
    <section class="sound-library-offer">
      <div class="min-w-0">
        <h3 class="sound-library-offer-title">
          Every Crafted Pack, now and future
        </h3>
        <p class="sound-library-offer-copy">
          <Show
            fallback={
              <>
                <span class="whitespace-nowrap">{counts()?.paid} packs</span>
                {' · '}
                <span class="whitespace-nowrap">free packs stay free</span>
                {' · '}
                <span class="whitespace-nowrap">14-day refund</span>
              </>
            }
            when={waiting()}
          >
            Finish the purchase in your browser ·{' '}
            <button class="link-button" type="button" onClick={cancelPurchase}>
              Cancel
            </button>
          </Show>
        </p>
      </div>
      <button
        class="primary-button sound-library-offer-button"
        classList={{ 'is-ghost': pendingPurchase() !== null }}
        disabled={pendingPurchase() !== null}
        title="Pay on keyecho.app · unlocks here automatically"
        type="button"
        onClick={() => void startBuyFlow(props.notify, props.openLicense)}
      >
        <Show fallback="Get every pack · $9.99" when={waiting()}>
          Waiting for keyecho.app…
        </Show>
      </button>
    </section>
  );
}

function BrowseDialog(props: {
  activeValue: string | undefined;
  installed: InstalledSound[];
  notify: Notify;
  open: boolean;
  openLicense: () => void;
  onClose: () => void;
  onDownloaded: () => Promise<void>;
  onUse: (sound: InstalledSound) => void;
}) {
  const [onlineSounds, setOnlineSounds] = createSignal<OnlineSound[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [loadFailed, setLoadFailed] = createSignal(false);
  const [downloadingName, setDownloadingName] = createSignal<string | null>(
    null,
  );
  const [playingId, setPlayingId] = createSignal<string | null>(null);
  const [loadingId, setLoadingId] = createSignal<string | null>(null);
  const [previewFailed, setPreviewFailed] = createSignal<string | null>(null);
  let requestId = 0;

  const loadOnlineSoundList = async () => {
    const currentRequestId = ++requestId;
    setLoading(true);
    setLoadFailed(false);

    try {
      const parsed = await loadOnlineSounds();
      if (currentRequestId === requestId) {
        setOnlineSounds(parsed);
      }
    } catch {
      if (currentRequestId === requestId) {
        setOnlineSounds([]);
        setLoadFailed(true);
      }
    } finally {
      if (currentRequestId === requestId) {
        setLoading(false);
      }
    }
  };

  const installedFor = (sound: OnlineSound) =>
    props.installed.find((item) => sound.id.startsWith(item.name));

  const handleDownload = async (sound: OnlineSound) => {
    if (!sound.downloadUrl) {
      return;
    }
    setDownloadingName(sound.name);

    try {
      unwrapCommand(await commands.downloadSound(sound.downloadUrl));
      await props.onDownloaded();
    } catch (error) {
      props.notify(`${sound.name} didn't download`, {
        tone: 'error',
        details: String(error),
        action: { label: 'Retry', run: () => void handleDownload(sound) },
      });
    } finally {
      setDownloadingName(null);
    }
  };

  const handlePreview = async (sound: OnlineSound) => {
    setPreviewFailed(null);
    setPlayingId(null);
    setLoadingId(sound.id);
    try {
      const result = await commands.previewCatalogPack(sound.id);
      if (result.status === 'error') {
        throw new Error(result.error);
      }
      setPlayingId(sound.id);
      window.setTimeout(
        () => setPlayingId((id) => (id === sound.id ? null : id)),
        PREVIEW_BURST_MS,
      );
    } catch {
      setPlayingId(null);
      setPreviewFailed(sound.id);
    } finally {
      setLoadingId((id) => (id === sound.id ? null : id));
    }
  };

  const [scrolled, setScrolled] = createSignal(false);

  // Two independent filters, like the site's catalog: sound type and price.
  const [category, setCategory] = createSignal<string | null>(null);
  const [price, setPrice] = createSignal<'free' | 'paid' | null>(null);
  const categories = createMemo(() =>
    Object.keys(CATEGORY_LABELS).filter((id) =>
      onlineSounds().some((sound) => sound.category === id),
    ),
  );
  const visibleSounds = createMemo(() =>
    onlineSounds().filter(
      (sound) =>
        (!category() || sound.category === category()) &&
        (!price() || (price() === 'free') === (sound.tier === 'free')),
    ),
  );
  const firstFree = createMemo(
    () => visibleSounds().find((sound) => sound.tier === 'free')?.id,
  );
  // Crafted packs lead under the banner; mark only where free ones begin.
  const mixed = () =>
    firstFree() !== undefined && visibleSounds()[0]?.id !== firstFree();

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
        <section class="dialog-panel is-fixed">
          <header class="dialog-header">
            <h2 class="dialog-title">Browse packs</h2>
            <button
              aria-label="Close"
              class="icon-button"
              type="button"
              onClick={props.onClose}
            >
              <Icon name="x" />
            </button>
          </header>

          <div
            class="dialog-body"
            classList={{ 'is-scrolled': scrolled() }}
            onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
          >
            <Show when={loading()}>
              <div class="dialog-state">Loading packs</div>
            </Show>

            <Show when={loadFailed()}>
              <div class="dialog-state dialog-state-error">
                <p class="m-0">
                  <Show
                    fallback="Pack list didn't load"
                    when={props.installed.length > 0}
                  >
                    Offline · installed packs still play
                  </Show>
                </p>
                <button
                  class="link-button"
                  type="button"
                  onClick={() => void loadOnlineSoundList()}
                >
                  Retry
                </button>
              </div>
            </Show>

            <Show when={!loading() && !loadFailed()}>
              <Show
                fallback={
                  <div class="dialog-state">
                    <p class="m-0">No packs online right now</p>
                    <button
                      class="link-button"
                      type="button"
                      onClick={() => void loadOnlineSoundList()}
                    >
                      Retry
                    </button>
                  </div>
                }
                when={onlineSounds().length > 0}
              >
                <OfferBanner
                  notify={props.notify}
                  openLicense={props.openLicense}
                />
                <Show when={categories().length > 1}>
                  <div class="pack-filters">
                    <div class="pack-filter">
                      <span class="pack-filter-label">Sound</span>
                      <SelectMenu
                        label="Sound"
                        options={[
                          { value: '', label: 'All' },
                          ...categories().map((id) => ({
                            value: id,
                            label: CATEGORY_LABELS[id],
                          })),
                        ]}
                        value={category() ?? ''}
                        onSelect={(value) => setCategory(value || null)}
                      />
                    </div>
                    <div class="pack-filter">
                      <span class="pack-filter-label">Price</span>
                      <SelectMenu
                        label="Price"
                        options={[
                          { value: '', label: 'All' },
                          { value: 'free', label: 'Free' },
                          { value: 'paid', label: 'Crafted' },
                        ]}
                        value={price() ?? ''}
                        onSelect={(value) =>
                          setPrice(
                            value === 'free' || value === 'paid' ? value : null,
                          )
                        }
                      />
                    </div>
                  </div>
                </Show>
                <Show when={visibleSounds().length === 0}>
                  <div class="dialog-state">No packs match these filters.</div>
                </Show>
                <For each={visibleSounds()}>
                  {(sound) => {
                    const installed = () => installedFor(sound);

                    return (
                      <>
                        <Show when={mixed() && sound.id === firstFree()}>
                          <p class="group-label">Free packs</p>
                        </Show>
                        <div class="sound-download-row has-preview">
                          <button
                            aria-busy={loadingId() === sound.id}
                            aria-label={`Preview ${sound.name}`}
                            class="secondary-button sound-preview-action"
                            classList={{
                              'is-loading': loadingId() === sound.id,
                            }}
                            title="Hear a few keys"
                            type="button"
                            onClick={() => void handlePreview(sound)}
                          >
                            <Show
                              fallback={
                                <Show
                                  fallback={<Icon name="play" />}
                                  when={playingId() === sound.id}
                                >
                                  <Icon name="square" />
                                </Show>
                              }
                              when={loadingId() === sound.id}
                            >
                              <Icon name="loading" />
                            </Show>
                          </button>
                          {/* Already the catalog's marketing name — don't run it
                              through the slug deriver, which splits on hyphens. */}
                          <span class="sound-download-name" title={sound.name}>
                            {sound.name}
                            <Show when={previewFailed() === sound.id}>
                              <span class="row-note">Preview didn't load</span>
                            </Show>
                          </span>
                          {/* Price lives in the group label, the action and the banner. */}
                          <span class="sound-download-price">
                            <Show when={installed()}>
                              <span class="installed-mark">
                                Installed <Icon name="check" />
                              </span>
                            </Show>
                          </span>
                          <PackAction
                            active={
                              installed() !== undefined &&
                              installed()?.value === props.activeValue
                            }
                            downloading={downloadingName() === sound.name}
                            installed={installed() !== undefined}
                            notify={props.notify}
                            openLicense={props.openLicense}
                            sound={sound}
                            onDownload={() => void handleDownload(sound)}
                            onUse={() => {
                              const match = installed();
                              if (match) {
                                props.onUse(match);
                              }
                            }}
                          />
                        </div>
                      </>
                    );
                  }}
                </For>
              </Show>
            </Show>
          </div>
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
              <Icon name="x" />
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
            <button class="text-button" type="button" onClick={props.onClose}>
              Close
            </button>
          </footer>
        </section>
      </div>
    </Show>
  );
}

interface CheckFailure {
  message: string;
  hint?: string;
  details?: string;
  retry?: boolean;
}

function LicenseSetting(props: {
  notify: Notify;
  onSoundsChanged: () => void;
}) {
  const [key, setKey] = createSignal(loadStoredLicenseKey());
  const [entitled, setEntitled] = createSignal<string[] | null>(null);
  const [checking, setChecking] = createSignal(false);
  const [failure, setFailure] = createSignal<CheckFailure | null>(null);
  const [downloadingPack, setDownloadingPack] = createSignal<string | null>(
    null,
  );
  const [restoreOpen, setRestoreOpen] = createSignal(false);
  const [restoreEmail, setRestoreEmail] = createSignal('');
  const [restoreSent, setRestoreSent] = createSignal(false);
  const [restoring, setRestoring] = createSignal(false);
  const [installed, installedControls] = createResource(async () => {
    return new Set((await loadSounds()).map((sound) => sound.name));
  });

  const isInstalled = (packId: string) => installed()?.has(packId) ?? false;

  const download = async (packId: string) => {
    setDownloadingPack(packId);
    try {
      unwrapCommand(
        await commands.downloadSound(packDownloadUrl(packId), key().trim()),
      );
      await installedControls.refetch();
      props.onSoundsChanged();
    } catch (error) {
      props.notify(`${packLabel(packId)} didn't download`, {
        tone: 'error',
        details: String(error),
        action: { label: 'Retry', run: () => void download(packId) },
      });
    } finally {
      setDownloadingPack(null);
    }
  };

  const check = async () => {
    const trimmed = key().trim();
    if (!trimmed) {
      setFailure({ message: 'Paste the key from your email' });
      setEntitled(null);
      return;
    }

    setChecking(true);
    setFailure(null);
    try {
      const { entitled } = await activateLicense(trimmed, props.notify, () => {
        void installedControls.refetch();
        props.onSoundsChanged();
      });
      setEntitled(entitled);
      setKey(trimmed);
      await installedControls.refetch();
      props.onSoundsChanged();
    } catch (error) {
      setEntitled(null);
      setFailure(
        error instanceof Error && error.message === 'invalid-key'
          ? {
              message: "That key isn't recognized",
              hint: 'Check for a missing character, or send the key to your email below.',
            }
          : {
              message: "Can't reach keyecho.app right now",
              details: String(error),
              retry: true,
            },
      );
    } finally {
      setChecking(false);
    }
  };

  const forget = () => {
    storeLicenseKey('');
    setKey('');
    setEntitled(null);
    setFailure(null);
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
      setRestoreSent(true);
    } catch (error) {
      props.notify("Can't reach keyecho.app right now", {
        tone: 'error',
        details: String(error),
      });
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
        <span class="mono-label mono-red">License key</span>
        <Show when={entitled() !== null}>
          <button class="link-button" type="button" onClick={forget}>
            Forget this key
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
          classList={{ 'is-invalid': failure() !== null }}
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
          <Show fallback="Activate" when={checking()}>
            Checking…
          </Show>
        </button>
      </form>

      <Show
        fallback={
          <Show when={entitled() === null}>
            <p class="field-hint">Paste the key from your email.</p>
          </Show>
        }
        when={failure()}
      >
        {(problem) => (
          <div class="field-error">
            <p class="field-error-title">{problem().message}</p>
            <Show when={problem().hint}>
              {(hint) => <p class="field-hint">{hint()}</p>}
            </Show>
            <Show when={problem().retry}>
              <button class="link-button" type="button" onClick={check}>
                Retry
              </button>
            </Show>
            <Show when={problem().details}>
              {(details) => (
                <details class="field-details">
                  <summary>Details</summary>
                  <p>{details()}</p>
                </details>
              )}
            </Show>
          </div>
        )}
      </Show>

      <div class="restore-block">
        <button
          class="link-button"
          type="button"
          onClick={() => setRestoreOpen((open) => !open)}
        >
          Lost your key? Send it to my email
        </button>
        <Show when={restoreOpen()}>
          <form
            class="restore-form"
            onSubmit={(event) => {
              event.preventDefault();
              void restore();
            }}
          >
            <span class="mono-label">Email</span>
            <div class="flex items-center gap-2">
              <input
                aria-label="Email"
                autocomplete="email"
                class="ui-field w-full"
                placeholder="you@example.com"
                type="email"
                value={restoreEmail()}
                onInput={(event) => setRestoreEmail(event.currentTarget.value)}
              />
              <button
                class="secondary-button shrink-0"
                disabled={restoring()}
                type="submit"
              >
                <Show fallback="Send key" when={restoring()}>
                  Sending…
                </Show>
              </button>
            </div>
            <Show when={restoreSent()}>
              <p class="field-hint">
                If that email has a purchase, the key is on its way.
              </p>
            </Show>
          </form>
        </Show>
      </div>

      <Show when={entitled()}>
        {(packs) => (
          <Show
            fallback={<p class="field-hint">This key has no packs yet</p>}
            when={packs().length > 0}
          >
            <div>
              <p class="mono-label">
                Activated · {packs().length} pack
                {packs().length === 1 ? '' : 's'}
              </p>
              {/* Rows sit flush like the browse dialog's: the separator is a
                  border-top between adjacent rows, so a gap here would leave the
                  hairline floating. */}
              <For each={packs()}>
                {(packId) => (
                  <div class="sound-download-row">
                    <span class="sound-download-name" title={packId}>
                      {packLabel(packId)}
                    </span>
                    <button
                      class="secondary-button sound-download-action"
                      disabled={downloadingPack() !== null}
                      type="button"
                      onClick={() => download(packId)}
                    >
                      <Show
                        fallback={
                          isInstalled(packId) ? 'Download again' : 'Download'
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

function UpdateStrip(props: { notify: Notify; onDismiss: () => void }) {
  return (
    <section class="update-strip">
      <span class="mono-label mono-red">v{APP_VERSION}</span>
      <span class="update-strip-title">{UPDATE_TITLE}</span>
      <button
        class="link-button"
        type="button"
        onClick={() => void startSoundTestFlow(props.notify)}
      >
        What's new
      </button>
      <button
        aria-label="Hide update"
        class="icon-button ml-auto"
        type="button"
        onClick={props.onDismiss}
      >
        <Icon name="x" />
      </button>
    </section>
  );
}

export default function App() {
  const notifier = createNotifier();
  const notify = notifier.notify;
  const [licenseOpen, setLicenseOpen] = createSignal(false);
  const openLicense = () => setLicenseOpen(true);
  const [browseOpen, setBrowseOpen] = createSignal(false);
  const [updateVisible, setUpdateVisible] = createSignal(!hasDismissedUpdate());

  const [sounds, soundControls] = createResource(loadSounds);
  const [selectedSound, selectedSoundControls] =
    createResource(loadSelectedSound);
  const [volume, setVolume] = createSignal(100);
  const [played, setPlayed] = createSignal<KeyPlayed | null>(null);
  const [preparing, setPreparing] = createSignal(false);

  const refreshSounds = () => {
    void soundControls.refetch();
    void selectedSoundControls.refetch();
  };

  const soundList = createMemo(() => sounds() ?? []);
  const hasSounds = () => soundList().length > 0;
  const currentPack = () =>
    soundList().find((sound) => sound.value === selectedSound());

  const status = (): StatusModel => {
    if (sounds.loading) {
      return { tone: 'none', name: 'Loading packs' };
    }
    if (sounds.error) {
      return {
        tone: 'none',
        name: "Pack list didn't load",
        retry: () => void soundControls.refetch(),
      };
    }
    if (!hasSounds()) {
      return { tone: 'none', name: 'No packs yet' };
    }
    const pack = currentPack();
    if (!pack) {
      return { tone: 'none', name: 'Pick a pack to start' };
    }
    if (volume() === 0) {
      return { tone: 'muted', name: pack.label, detail: 'Muted · volume 0' };
    }
    const last = played();
    return {
      tone: 'ready',
      name: pack.label,
      detail: last ? `Ready · last key ${keyLabel(last.key)}` : 'Ready',
      level: last?.level ?? 0,
    };
  };

  const handleSelect = async (value: string) => {
    if (!value) {
      return;
    }
    selectedSoundControls.mutate(value);

    // Selecting decodes the whole pack in Rust, which takes a moment — without
    // this the panel looks idle and the audition seems to fire late.
    setPreparing(true);
    try {
      const result = await commands.selectSound(value);
      if (result.status === 'error') {
        notify("That pack didn't load. Download it again.", { tone: 'error' });
      } else {
        void commands.previewPackSound(); // hear what you picked
      }
    } finally {
      setPreparing(false);
    }

    await selectedSoundControls.refetch();
  };

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
        void activateLicense(trimmed, notify, refreshSounds)
          .then(async ({ entitled }) => {
            refreshSounds();
            // You just bought this and came back — arm it rather than making
            // you hunt for it. On a bundle this is the pack you picked first.
            const first = entitled[0];
            if (first && (await selectPackById(first))) {
              refreshSounds();
            }
            if (entitled.length === 1 && first) {
              notify(`${packLabel(first)} is ready. Type to hear it.`);
            } else if (entitled.length > 1) {
              notify('All packs unlocked. Type to hear them.');
            }
          })
          .catch((error: unknown) => {
            notify("Couldn't activate. Paste your key in License.", {
              tone: 'error',
              details: String(error),
            });
          });
      },
      { defer: true },
    ),
  );

  onMount(() => {
    void initDeepLinks(notify);
    void onKeyPlayed(setPlayed).then((unlisten) => onCleanup(unlisten));
  });

  return (
    <>
      <main class="flex h-full flex-col overflow-y-auto bg-background p-4 text-foreground">
        <section class="app-card mx-auto my-auto max-w-xl">
          <header class="card-hdr">
            <img alt="" class="h-6 w-6" src={iconUrl} />
            <h1 class="text-[0.9375rem] font-semibold tracking-tight">
              KeyEcho
            </h1>
            <div class="ml-auto flex items-center gap-2">
              <button
                class="secondary-button whats-new-button"
                type="button"
                onClick={openLicense}
              >
                License
              </button>
            </div>
          </header>

          <StatusBar status={status()} />

          <div class="px-5 py-5">
            <p class="mono-label mono-red pack-label">Sound pack</p>
            <div class="pack-picker">
              <Show
                fallback={
                  <div class="ui-field pack-empty-field w-full">
                    Choose a pack
                  </div>
                }
                when={hasSounds()}
              >
                <SelectMenu
                  label="Sound pack"
                  placeholder="Choose a pack"
                  disabled={sounds.loading || preparing()}
                  options={soundList()}
                  preparing={preparing()}
                  value={selectedSound() ?? undefined}
                  onSelect={(value) => void handleSelect(value)}
                />
              </Show>
              <button
                class={`${hasSounds() ? 'secondary-button' : 'primary-button'} shrink-0`}
                disabled={sounds.loading}
                type="button"
                onClick={() => setBrowseOpen(true)}
              >
                Browse packs
              </button>
            </div>
            <Show when={!hasSounds() && catalogCounts()}>
              {(counts) => (
                <p class="field-hint pack-hint">
                  {counts().free} packs are free. Pick one and start typing.
                </p>
              )}
            </Show>
          </div>

          <div class="divide-y divide-border border-t border-border px-5">
            <SettingRow label="Auto launch">
              <AutoLaunchSetting notify={notify} />
            </SettingRow>

            <SettingRow label="Volume">
              <VolumeSetting
                notify={notify}
                volume={volume}
                onVolume={setVolume}
              />
            </SettingRow>
          </div>

          <BrowseDialog
            activeValue={selectedSound() ?? undefined}
            installed={soundList()}
            notify={notify}
            open={browseOpen()}
            openLicense={openLicense}
            onClose={() => setBrowseOpen(false)}
            onDownloaded={async () => {
              await soundControls.refetch();
            }}
            onUse={(sound) => void handleSelect(sound.value)}
          />

          <LicenseDialog
            notify={notify}
            open={licenseOpen()}
            onClose={() => setLicenseOpen(false)}
            onSoundsChanged={refreshSounds}
          />

          <Show when={updateVisible()}>
            <UpdateStrip
              notify={notify}
              onDismiss={() => {
                rememberUpdateDismissed();
                setUpdateVisible(false);
              }}
            />
          </Show>

          <footer class="card-foot">
            <button
              class="mono-label card-foot-link"
              type="button"
              onClick={async () => {
                const result = await commands.openSoundsFolder();
                if (result.status === 'error') {
                  notify("Sounds folder didn't open", {
                    tone: 'error',
                    details: result.error,
                  });
                }
              }}
            >
              Sounds folder
            </button>
            <button
              class="mono-label card-foot-link"
              type="button"
              onClick={() => openExternalUrl('https://keyecho.app', notify)}
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
