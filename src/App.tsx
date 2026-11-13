import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js';

import tauriConfig from '../src-tauri/tauri.conf.json';
import * as s from './App.css';
import { BuySheet } from './BuySheet';
import { cancelPurchase } from './buy';
import type { OnlineSound } from './catalog';
import {
  catalogCounts,
  catalogPackFor,
  loadOnlineSounds,
  loadPackCatalog,
  ownsEveryPaid,
  packLabel,
  sortPacks,
} from './catalog';
import { activationKey, initDeepLinks } from './deeplink';
import type { SleevePack, SleeveStatus, StarterChoice, Tape } from './Home';
import {
  FirstLaunchSleeve,
  HintRow,
  SettingsHint,
  HomeControls,
  HomeFoot,
  HomeScroll,
  Sleeve,
  SleevePending,
} from './Home';
import {
  activateLicense,
  loadSelectedSound,
  loadSounds,
  openExternalUrl,
  selectPackById,
  unwrapCommand,
} from './library';
import {
  packDownloadUrl,
  refreshStoredLicense,
  verifiedLicense,
} from './license';
import { LicenseSheet } from './LicenseSheet';
import { ALL_ACCESS_PRICE_USD, activeAllAccessPromo, formatUsd } from './offer';
import { KEYECHO_ORIGIN } from './origin';
import { SettingsSheet } from './SettingsSheet';
import { DockOffer, SlimOffer } from './OfferBar';
import type { PackShelf } from './packs';
import {
  CATEGORY_IDS,
  isCategoryId,
  moveInGrid,
  PACK_SHELVES,
  stepShelf,
  tintFor,
} from './packs';
import type { FirstLaunchScene } from './first-launch';
import { firstLaunchAction, firstLaunchNote, homeView } from './first-launch';
import { firstLaunchHintKeys, homeHintKeys, packsHintKeys } from './hint-keys';
import type { PackCard } from './pack-cards';
import { buildCards, GRID_COLUMNS } from './pack-cards';
import type { PacksState } from './PacksPage';
import { PacksPage } from './PacksPage';
import { createPreview } from './preview';
import { commands } from './services/bindings';
import type { ShortcutScreen } from './shortcuts';
import { focusKind, shortcutFor } from './shortcuts';
import { createStarterPackSetup, pickStarterPack } from './starter-pack';
import { categoryTint } from './styles/tokens.css';
import { createNotifier, Toasts } from './Toasts';
import { UpdateStrip } from './UpdateStrip';
import { createVolumeControl } from './volume';

const APP_VERSION = tauriConfig.version;
const UPDATE_TITLE = 'A new look, shortcuts and Settings';
const UPDATES_URL = `${KEYECHO_ORIGIN}/updates`;
const UPDATE_DISMISSED_KEY = `keyecho:v${APP_VERSION}:update-dismissed`;

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

/** Packs the saved key was last verified for. */
function ownedPacks(): ReadonlySet<string> {
  return verifiedLicense()?.packs ?? new Set();
}

type View = 'home' | 'packs';

type OpenSheet =
  | { kind: 'license' }
  | { kind: 'settings' }
  | { kind: 'buy'; pack: OnlineSound | null; campaign: string };

export default function App() {
  const notifier = createNotifier();
  const notify = notifier.notify;
  const preview = createPreview();

  const [view, setView] = createSignal<View>('home');
  const [sheet, setSheet] = createSignal<OpenSheet | null>(null);
  const openLicense = () => setSheet({ kind: 'license' });
  const openSettings = () => setSheet({ kind: 'settings' });
  const [updateVisible, setUpdateVisible] = createSignal(!hasDismissedUpdate());
  const [offline, setOffline] = createSignal(false);
  const [now, setNow] = createSignal(Date.now());

  const [sounds, soundControls] = createResource(loadSounds);
  const [selectedSound, selectedSoundControls] =
    createResource(loadSelectedSound);
  // A failed load resolves to null: reading an errored resource would throw.
  const [catalog, catalogControls] = createResource(async () => {
    try {
      return await loadOnlineSounds();
    } catch {
      return null;
    }
  });
  const catalogFailed = () => !catalog.loading && catalog() === null;

  const volume = createVolumeControl({
    load: async () => unwrapCommand(await commands.getVolume()),
    save: async (next) => {
      unwrapCommand(await commands.updateVolume(next));
    },
    notify,
  });
  const [autoLaunch, setAutoLaunch] = createSignal(false);
  const [autoLaunchLoading, setAutoLaunchLoading] = createSignal(true);
  const [preparing, setPreparing] = createSignal(false);

  const [shelf, setShelf] = createSignal<PackShelf>('yours');
  const [query, setQuery] = createSignal('');
  const [selectedCard, setSelectedCard] = createSignal(-1);
  const [firstCategory, setFirstCategory] = createSignal<
    (typeof CATEGORY_IDS)[number] | null
  >(null);
  const [downloadingId, setDownloadingId] = createSignal<string | null>(null);
  let searchInput: HTMLInputElement | undefined;

  const refreshSounds = () => {
    void soundControls.refetch();
    void selectedSoundControls.refetch();
  };

  const starterPack = createStarterPackSetup({
    installedNames: async () =>
      unwrapCommand(await commands.getSounds()).map((sound) => sound.name),
    loadCatalog: async () => (await loadPackCatalog()).packs,
    download: async (archiveUrl) => {
      unwrapCommand(await commands.downloadSound(archiveUrl));
      refreshSounds();
    },
    select: async (packId) => {
      // Keep a pack the user picked while this was downloading.
      if (await loadSelectedSound()) {
        return;
      }
      if (!(await selectPackById(packId))) {
        throw new Error(`${packId} didn't load`);
      }
      refreshSounds();
    },
  });

  const online = createMemo(() => catalog() ?? []);
  const sortedOnline = createMemo(() => sortPacks(online()));
  const counts = createMemo(() =>
    online().length > 0 ? catalogCounts(online()) : null,
  );
  const owner = createMemo(() => ownsEveryPaid(online(), ownedPacks()));
  // Hidden for people who already own every pack.
  const promo = () => (owner() ? undefined : activeAllAccessPromo(now()));

  const soundList = createMemo(() => (sounds.error ? [] : (sounds() ?? [])));
  const selectedValue = () =>
    selectedSound.error ? null : (selectedSound() ?? null);
  const hasSounds = () => soundList().length > 0;
  const currentPack = () =>
    soundList().find((sound) => sound.value === selectedValue());
  const currentOnline = () => {
    const pack = currentPack();
    return pack ? catalogPackFor(online(), pack.name) : undefined;
  };
  const shownHome = () =>
    homeView({
      state: sounds.state,
      failed: Boolean(sounds.error),
      count: soundList().length,
    });
  const firstLaunch = () => shownHome() === 'first';

  // First launch: the starter pack's character until the user picks one.
  const firstShown = () =>
    firstCategory() ??
    tintOrClicky(pickStarterPack(online())?.category ?? undefined);
  const starterChoice = createMemo(
    (): (StarterChoice & { online: OnlineSound }) | null => {
      const category = firstShown();
      const inCategory = online().filter((pack) => pack.category === category);
      const pack =
        inCategory.find((item) => item.tier === 'free' && item.downloadUrl) ??
        inCategory[0];
      return pack
        ? {
            id: pack.id,
            name: pack.name,
            category: pack.category,
            tagline: pack.tagline,
            free: pack.tier === 'free' && pack.downloadUrl !== undefined,
            price: formatUsd(pack.priceUsd),
            online: pack,
          }
        : null;
    },
  );
  // One reading for the button, enter and the hint row.
  const firstScene = (): FirstLaunchScene => {
    const id = downloadingId();
    return {
      shown: starterChoice(),
      starterId: pickStarterPack(online())?.id,
      starterState: starterPack.state(),
      downloading: id
        ? { id, name: online().find((pack) => pack.id === id)?.name ?? id }
        : null,
    };
  };
  const firstActionNow = () => firstLaunchAction(firstScene());

  const cards = createMemo(() =>
    buildCards({
      shelf: shelf(),
      query: query(),
      online: sortedOnline(),
      installed: soundList(),
      activeValue: selectedValue() ?? undefined,
      owned: ownedPacks(),
    }),
  );
  const selected = (): PackCard | undefined => cards()[selectedCard()];
  const packsState = (): PacksState => {
    if (catalog.loading) {
      return 'loading';
    }
    if (catalogFailed()) {
      return 'failed';
    }
    return online().length === 0 ? 'empty' : 'ready';
  };

  // The window takes the colour of the pack in use, or of the word picked on Packs.
  const windowTint = () => {
    if (view() === 'packs') {
      if (query().trim()) {
        return 'none';
      }
      const current = shelf();
      return current === 'yours' ? tintFor(currentOnline()?.category) : current;
    }
    if (firstLaunch()) {
      return firstShown();
    }
    return tintFor(currentOnline()?.category);
  };

  const screen = (): ShortcutScreen => {
    if (sheet()) {
      return 'sheet';
    }
    if (view() === 'packs') {
      return 'packs';
    }
    return firstLaunch() ? 'first' : 'home';
  };

  // ---- volume and login ----

  const refreshAutoLaunch = async () => {
    setAutoLaunchLoading(true);
    try {
      setAutoLaunch(unwrapCommand(await commands.isAutoLaunchEnabled()));
    } catch (error) {
      notify("Auto launch status didn't load", {
        tone: 'error',
        details: String(error),
      });
    } finally {
      setAutoLaunchLoading(false);
    }
  };

  const changeAutoLaunch = async (checked: boolean) => {
    const previous = autoLaunch();
    setAutoLaunch(checked);
    setAutoLaunchLoading(true);
    try {
      unwrapCommand(await commands.setAutoLaunch(checked));
      setAutoLaunch(unwrapCommand(await commands.isAutoLaunchEnabled()));
    } catch (error) {
      setAutoLaunch(previous);
      notify("Auto launch didn't change", {
        tone: 'error',
        details: String(error),
        action: { label: 'Retry', run: () => void changeAutoLaunch(checked) },
      });
    } finally {
      setAutoLaunchLoading(false);
    }
  };

  // ---- packs ----

  let selectQueue: Promise<unknown> = Promise.resolve();
  let selectTicket = 0;
  const handleSelect = async (value: string) => {
    if (!value) {
      return;
    }
    selectedSoundControls.mutate(value);
    const ticket = ++selectTicket;

    // Selecting decodes the whole pack in Rust, which takes a moment — without
    // this the window looks idle and the audition seems to fire late.
    setPreparing(true);
    // One select at a time, in click order: a big pack decoding slowly must
    // not land after, and override, a pack picked later.
    const run = selectQueue.then(() => commands.selectSound(value));
    selectQueue = run.catch(() => undefined);
    try {
      const result = await run;
      if (ticket !== selectTicket) {
        return;
      }
      if (result.status === 'error') {
        notify("That pack didn't load. Download it again.", { tone: 'error' });
      } else {
        void commands.previewPackSound(); // hear what you picked
      }
    } finally {
      if (ticket === selectTicket) {
        setPreparing(false);
      }
    }

    await selectedSoundControls.refetch();
  };

  const stepInstalled = (delta: number) => {
    const list = soundList();
    if (list.length === 0 || preparing()) {
      return;
    }
    const index = list.findIndex((sound) => sound.value === selectedValue());
    const next =
      index === -1
        ? delta > 0
          ? 0
          : list.length - 1
        : (index + delta + list.length) % list.length;
    void handleSelect(list[next].value);
  };

  const handleDownload = async (sound: OnlineSound) => {
    // Paid packs download through the store with the verified key.
    const license = verifiedLicense();
    let request: { url: string; key?: string } | null = null;
    if (sound.tier === 'free') {
      request = sound.downloadUrl ? { url: sound.downloadUrl } : null;
    } else if (license?.packs.has(sound.id)) {
      request = { url: packDownloadUrl(sound.id), key: license.key };
    }
    if (!request || downloadingId()) {
      return;
    }
    setDownloadingId(sound.id);

    try {
      unwrapCommand(await commands.downloadSound(request.url, request.key));
      await soundControls.refetch();
      // Nothing playing yet: make the new pack audible at once.
      if (!(await loadSelectedSound()) && (await selectPackById(sound.id))) {
        refreshSounds();
      }
    } catch (error) {
      notify(`${sound.name} didn't download`, {
        tone: 'error',
        details: String(error),
        action: { label: 'Retry', run: () => void handleDownload(sound) },
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const openBuy = (pack: OnlineSound | null, campaign: string) => {
    setSheet({ kind: 'buy', pack, campaign });
  };

  const runCardAction = (card: PackCard) => {
    switch (card.action) {
      case 'use':
        if (card.installed) {
          void handleSelect(card.installed.value);
        }
        break;
      case 'download':
      case 'download-owned':
        if (card.online) {
          void handleDownload(card.online);
        }
        break;
      case 'buy':
        if (card.online) {
          openBuy(card.online, 'pack_row');
        }
        break;
      case 'in-use':
        break;
    }
  };

  const openPacks = (focusSearch: boolean) => {
    if (view() !== 'packs') {
      const category = currentOnline()?.category;
      setShelf(
        isCategoryId(category)
          ? category
          : hasSounds()
            ? 'yours'
            : firstShown(),
      );
      setQuery('');
      setSelectedCard(-1);
      setView('packs');
      void refreshStoredLicense();
      if (catalogFailed()) {
        void catalogControls.refetch();
      }
    }
    if (focusSearch) {
      queueMicrotask(() => searchInput?.focus());
    }
  };

  const closePacks = () => {
    setView('home');
    setQuery('');
  };

  const pickShelf = (next: PackShelf, viaKeyboard: boolean) => {
    setQuery('');
    setShelf(next);
    setSelectedCard(viaKeyboard ? 0 : -1);
  };

  const openSoundsFolder = async () => {
    const result = await commands.openSoundsFolder();
    if (result.status === 'error') {
      notify("Sounds folder didn't open", {
        tone: 'error',
        details: result.error,
      });
    }
  };

  // ---- first launch ----

  const firstAction = () => {
    const choice = starterChoice();
    const action = firstActionNow();
    if (!choice) {
      return;
    }
    if (action === 'download') {
      void handleDownload(choice.online);
    } else if (action === 'get') {
      openBuy(choice.online, 'first_launch');
    }
  };

  // ---- home model ----

  const sleeveStatus = (): SleeveStatus => {
    if (!currentPack()) {
      return 'none';
    }
    return volume.volume() === 0 ? 'muted' : 'ready';
  };

  const sleevePack = (): SleevePack | null => {
    const pack = currentPack();
    if (!pack) {
      return null;
    }
    const match = currentOnline();
    return {
      id: match?.id ?? pack.name,
      name: match?.name ?? pack.label,
      category: match?.category,
      tagline: match?.tagline,
    };
  };

  const sleeveTitle = () => {
    // Retrying a list that failed; a plain refresh keeps the last answer.
    if (sounds.loading && sounds.error) {
      return 'Loading packs';
    }
    if (sounds.error) {
      return "Pack list didn't load";
    }
    if (starterPack.state() === 'failed') {
      return "Free pack didn't load";
    }
    return 'Pick a pack to start';
  };

  const sleeveRetry = () => {
    if (sounds.error) {
      return () => void soundControls.refetch();
    }
    if (!currentPack() && starterPack.state() === 'failed') {
      return () => void starterPack.run();
    }
    return undefined;
  };

  const tape = (): Tape => ({
    retry: sleeveRetry(),
  });

  const firstTape = (): Tape => {
    const note = firstLaunchNote(firstScene());
    return {
      message: note.message,
      retry: note.retryStarter ? () => void starterPack.run() : undefined,
    };
  };

  const homeLinks = () => <SettingsHint onOpen={openSettings} />;

  const allPrice = () => formatUsd(promo()?.priceUsd ?? ALL_ACCESS_PRICE_USD);

  // Packs on this Mac out of the whole catalog, until every paid one is owned.
  const unlock = () => {
    const total = counts()?.total;
    if (owner() || !total) {
      return null;
    }
    return {
      owned: Math.min(soundList().length, total),
      total,
      price: allPrice(),
    };
  };

  const licenseStatus = () => {
    if (owner()) {
      return 'All Sounds';
    }
    const count = ownedPacks().size;
    if (count === 0) {
      return 'No key';
    }
    return count === 1 ? '1 pack' : `${count} packs`;
  };

  const homeNote = () => {
    if (sleeveStatus() !== 'muted') {
      return undefined;
    }
    return offline()
      ? 'Muted · volume 0 · Offline · installed packs still play'
      : 'Muted · volume 0';
  };

  const flowToasts = () => (
    <Toasts
      placement="flow"
      removeToast={notifier.removeToast}
      toasts={notifier.toasts}
    />
  );
  const sheetToasts = () => (
    <Toasts
      placement="sheet"
      removeToast={notifier.removeToast}
      toasts={notifier.toasts}
    />
  );

  // ---- effects ----

  // Deep-link activation lives here, not in the License sheet: that component
  // only mounts while the sheet is open, so a keyecho://activate link arriving
  // with it closed used to activate but install nothing.
  createEffect(
    on(
      activationKey,
      (incoming) => {
        const trimmed = incoming?.trim();
        if (!trimmed) {
          return;
        }
        cancelPurchase(); // the key is here; stop polling for it
        if (sheet()?.kind === 'buy') {
          setSheet(null);
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

  // Keep the keyboard selection on a card that exists.
  createEffect(() => {
    if (selectedCard() >= cards().length) {
      setSelectedCard(cards().length - 1);
    }
  });

  const onShortcut = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) {
      return;
    }
    const current = screen();
    const shortcut = shortcutFor(
      event,
      current,
      focusKind(document.activeElement),
    );
    if (!shortcut) {
      return;
    }
    switch (shortcut.kind) {
      case 'back':
        if (current === 'sheet') {
          setSheet(null);
        } else if (current === 'packs') {
          closePacks();
        } else {
          return;
        }
        break;
      case 'settings':
        openSettings();
        break;
      case 'find':
        openPacks(true);
        break;
      case 'pack':
        if (current === 'first') {
          // A clicked category word keeps focus; enter would click it again.
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          const index = CATEGORY_IDS.indexOf(firstShown());
          const count = CATEGORY_IDS.length;
          setFirstCategory(
            CATEGORY_IDS[(index + shortcut.delta + count) % count],
          );
        } else {
          stepInstalled(shortcut.delta);
        }
        break;
      case 'volume': {
        const level = volume.volume();
        if (level === null || !volume.adjustable()) {
          return;
        }
        volume.change(level + shortcut.delta);
        break;
      }
      case 'shelf': {
        // Past the last shelf (or before the first), Tab moves focus on to
        // the page's buttons instead of wrapping, so it can't trap the keyboard.
        const index = PACK_SHELVES.indexOf(shelf());
        const edge = shortcut.delta > 0 ? PACK_SHELVES.length - 1 : 0;
        if (index === edge) {
          return;
        }
        pickShelf(stepShelf(shelf(), shortcut.delta), true);
        break;
      }
      case 'move': {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setSelectedCard(
          moveInGrid(
            selectedCard(),
            shortcut.move,
            GRID_COLUMNS,
            cards().length,
          ),
        );
        break;
      }
      case 'preview': {
        const id =
          current === 'first' ? starterChoice()?.id : selected()?.online?.id;
        if (!id) {
          return;
        }
        void preview.preview(id);
        break;
      }
      case 'activate':
        if (current === 'first') {
          firstAction();
        } else {
          const card = selected();
          if (!card) {
            return;
          }
          runCardAction(card);
        }
        break;
    }
    event.preventDefault();
  };

  onMount(() => {
    void initDeepLinks(notify);

    void volume.refresh();
    void refreshAutoLaunch();
    void refreshStoredLicense();

    void starterPack.run();
    setOffline(!navigator.onLine);
    const goOnline = () => {
      setOffline(false);
      // Offline on first launch: try again once the network is back.
      if (starterPack.state() === 'failed') {
        void starterPack.run();
      }
      if (catalogFailed()) {
        void catalogControls.refetch();
      }
    };
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('keydown', onShortcut);
    // The offer ends on a date; re-read the clock now and then.
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    onCleanup(() => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('keydown', onShortcut);
      window.clearInterval(clock);
      volume.dispose();
    });
  });

  return (
    <div class={`${s.window} ${categoryTint[windowTint()]}`}>
      <div class={s.page} inert={sheet() !== null}>
        <Switch>
          <Match when={view() === 'packs'}>
            <PacksPage
              cards={cards()}
              counts={counts()}
              dock={
                <>
                  <Show when={!sheet()}>{flowToasts()}</Show>
                  <Show when={!owner() && packsState() === 'ready'}>
                    <DockOffer
                      paid={counts()?.paid}
                      promo={promo()}
                      onGet={() => openBuy(null, 'browse_offer')}
                    />
                  </Show>
                  <Show
                    fallback={<HintRow trailing={[['esc', 'back']]} />}
                    when={packsState() === 'ready' || shelf() === 'yours'}
                  >
                    <HintRow
                      keys={packsHintKeys(
                        selected(),
                        cards().length,
                        downloadingId() !== null,
                        preview.playingId() !== null &&
                          preview.playingId() === selected()?.online?.id,
                      )}
                      trailing={[['esc', 'back']]}
                    />
                  </Show>
                </>
              }
              downloadingId={downloadingId()}
              preview={preview}
              query={query()}
              searchRef={(element) => (searchInput = element)}
              selected={selectedCard()}
              shelf={shelf()}
              state={packsState()}
              totalCount={counts()?.total ?? null}
              offline={offline()}
              onAction={runCardAction}
              onBack={closePacks}
              onQuery={(next) => {
                setQuery(next);
                setSelectedCard(-1);
              }}
              onRetry={() => void catalogControls.refetch()}
              onSelect={setSelectedCard}
              onShelf={(next) => pickShelf(next, false)}
              onSoundsFolder={() => void openSoundsFolder()}
            />
          </Match>
          <Match when={view() === 'home'}>
            <HomeScroll>
              <Switch>
                <Match when={shownHome() === 'pending'}>
                  <SleevePending />
                </Match>
                <Match when={shownHome() === 'home'}>
                  <Sleeve
                    offline={offline()}
                    pack={sleevePack()}
                    status={sleeveStatus()}
                    tape={tape()}
                    title={sleeveTitle()}
                    owner={owner()}
                    unlock={unlock()}
                    onChangePack={() => openPacks(true)}
                    onUnlock={() => openBuy(null, 'home_badge')}
                  />
                </Match>
                <Match when={firstLaunch()}>
                  <FirstLaunchSleeve
                    category={firstShown()}
                    action={firstActionNow()}
                    offline={offline()}
                    pack={starterChoice()}
                    previewing={{
                      loading: preview.loadingId() === starterChoice()?.id,
                      playing: preview.playingId() === starterChoice()?.id,
                    }}
                    tape={firstTape()}
                    onBuy={firstAction}
                    onCategory={setFirstCategory}
                    onDownload={firstAction}
                    onPreview={() => {
                      const id = starterChoice()?.id;
                      if (id) {
                        void preview.preview(id);
                      }
                    }}
                  />
                </Match>
              </Switch>
              <HomeControls
                volume={volume.volume()}
                volumeLoading={volume.loading()}
                onVolume={volume.change}
                onVolumeRetry={
                  volume.failed() ? () => void volume.refresh() : undefined
                }
              />
              <Show when={updateVisible()}>
                <UpdateStrip
                  title={UPDATE_TITLE}
                  version={APP_VERSION}
                  onDismiss={() => {
                    rememberUpdateDismissed();
                    setUpdateVisible(false);
                  }}
                  onWhatsNew={() => void openExternalUrl(UPDATES_URL, notify)}
                />
              </Show>
              <Show when={shownHome() === 'home' && promo()}>
                {(active) => (
                  <SlimOffer
                    promo={active()}
                    onGet={() => openBuy(null, 'home_offer')}
                  />
                )}
              </Show>
              <Show when={firstLaunch() && counts()?.total}>
                {(count) => (
                  <HomeFoot count={count()} onBrowse={() => openPacks(false)} />
                )}
              </Show>
            </HomeScroll>
            <Show when={!sheet()}>{flowToasts()}</Show>
            <Switch>
              <Match when={shownHome() === 'pending'}>
                <HintRow />
              </Match>
              <Match when={shownHome() === 'home'}>
                <HintRow
                  keys={homeHintKeys(hasSounds(), volume.volume() !== null)}
                  note={homeNote()}
                >
                  {homeLinks()}
                </HintRow>
              </Match>
              <Match when={firstLaunch()}>
                <HintRow
                  keys={firstLaunchHintKeys(
                    firstActionNow(),
                    preview.playingId() !== null &&
                      preview.playingId() === starterChoice()?.id,
                  )}
                >
                  {homeLinks()}
                </HintRow>
              </Match>
            </Switch>
          </Match>
        </Switch>
      </div>

      <Switch>
        <Match when={sheet()?.kind === 'settings'}>
          <SettingsSheet
            allPrice={owner() ? null : allPrice()}
            autoLaunch={autoLaunch()}
            autoLaunchLoading={autoLaunchLoading()}
            licenseStatus={licenseStatus()}
            owner={owner()}
            toasts={sheetToasts()}
            version={APP_VERSION}
            onAutoLaunch={(enabled) => void changeAutoLaunch(enabled)}
            onClose={() => setSheet(null)}
            onLicense={openLicense}
            onSoundsFolder={() => void openSoundsFolder()}
            onUnlockAll={() => openBuy(null, 'settings')}
            onWhatsNew={() => void openExternalUrl(UPDATES_URL, notify)}
          />
        </Match>
        <Match when={sheet()?.kind === 'license'}>
          <LicenseSheet
            notify={notify}
            toasts={sheetToasts()}
            onClose={() => setSheet(null)}
            onSoundsChanged={refreshSounds}
          />
        </Match>
        <Match
          when={(() => {
            const open = sheet();
            return open?.kind === 'buy' ? open : null;
          })()}
        >
          {(open) => (
            <BuySheet
              campaign={open().campaign}
              notify={notify}
              openLicense={openLicense}
              pack={open().pack}
              paid={counts()?.paid}
              promo={promo()}
              toasts={sheetToasts()}
              onClose={() => setSheet(null)}
            />
          )}
        </Match>
      </Switch>
    </div>
  );
}

function tintOrClicky(category: string | undefined) {
  return isCategoryId(category) ? category : CATEGORY_IDS[0];
}
