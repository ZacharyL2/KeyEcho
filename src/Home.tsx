import { assignInlineVars } from '@vanilla-extract/dynamic';
import type { JSX } from 'solid-js';
import { children, For, Show } from 'solid-js';

import { CategoryWords } from './CategoryWords';
import type { FirstLaunchAction } from './first-launch';
import * as s from './Home.css';
import { KeyMechanism } from './KeyMechanism';
import type { CategoryId } from './packs';
import { CATEGORY_IDS, CATEGORY_LABELS, isCategoryId } from './packs';
import type { TilePack } from './PackTile';
import { PackTile, PreviewButton } from './PackTile';
import * as ui from './styles/controls.css';
import { MAX_VOLUME } from './volume';

// Settings opens with ⌘, on macOS and Ctrl+, elsewhere (shortcuts.ts).
const SETTINGS_KEYS =
  typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)
    ? '⌘,'
    : 'Ctrl ,';

export type SleeveStatus = 'ready' | 'muted' | 'none';

export interface Tape {
  message?: string;
  retry?: () => void;
}

/** Only what is wrong: muted, no pack, offline. Working needs no badge. */
function Chips(props: { status: SleeveStatus; offline: boolean }) {
  return (
    <>
      <Show when={props.status !== 'ready'}>
        <span class={ui.chip.off}>
          <i class={ui.chipDot.off} />
          {props.status === 'muted' ? 'Muted' : 'No pack'}
        </span>
      </Show>
      <Show when={props.offline}>
        <span class={ui.chip.off}>Offline</span>
      </Show>
    </>
  );
}

function LevelTape(props: { tape: Tape }) {
  return (
    <Show when={props.tape.message || props.tape.retry}>
      <div class={s.tape}>
        <span class={ui.grow} />
        <span class={s.tapeMessage}>
          {props.tape.message}
          <Show when={props.tape.retry}>
            {(retry) => (
              <button
                class={ui.smallButton}
                type="button"
                onClick={() => retry()()}
              >
                Retry
              </button>
            )}
          </Show>
        </span>
      </div>
    </Show>
  );
}

export interface SleevePack extends TilePack {
  tagline?: string;
}

/** The current pack's sleeve: large line art, name, status and level tape. */
export function Sleeve(props: {
  pack: SleevePack | null;
  /** Shown in place of a pack name while there is none to show. */
  title: string;
  status: SleeveStatus;
  offline: boolean;
  tape: Tape;
  /** Shown until every paid pack is owned; null once it is, or while unknown. */
  unlock: { owned: number; total: number; price: string } | null;
  owner: boolean;
  onUnlock: () => void;
  onChangePack: () => void;
}) {
  const categoryId = () => {
    const id = props.pack?.category;
    return isCategoryId(id) ? id : null;
  };
  const category = () => {
    const id = categoryId();
    return id ? CATEGORY_LABELS[id] : null;
  };

  return (
    <section aria-label="Current pack" class={s.sleeve}>
      <div class={s.art} classList={{ [s.dimmed]: props.status === 'muted' }}>
        <Show when={props.pack}>
          <KeyMechanism category={categoryId()} />
        </Show>
        <div class={s.top}>
          <Chips offline={props.offline} status={props.status} />
          <span class={ui.grow} />
          <Show
            fallback={
              <Show when={props.owner}>
                <span class={s.ownerBadge}>All Sounds</span>
              </Show>
            }
            when={props.unlock}
          >
            {(unlock) => (
              <button
                class={s.unlock}
                type="button"
                onClick={() => props.onUnlock()}
              >
                <span class={s.unlockCount}>
                  {unlock().owned} of {unlock().total} packs
                </span>
                <span>
                  Unlock all <b class={s.unlockPrice}>{unlock().price}</b>
                </span>
              </button>
            )}
          </Show>
        </div>
        <div class={s.titleBlock}>
          <Show when={category()}>
            {(label) => <span class={s.category}>{label()}</span>}
          </Show>
          <h1 class={s.packName}>{props.pack?.name ?? props.title}</h1>
          <Show when={props.pack?.tagline}>
            {(tagline) => <p class={s.tagline}>{tagline()}</p>}
          </Show>
        </div>
        <button
          aria-keyshortcuts="/"
          class={s.changePack}
          type="button"
          onClick={() => props.onChangePack()}
        >
          Change pack <kbd class={ui.buttonKbd}>/</kbd>
        </button>
      </div>
      <LevelTape tape={props.tape} />
    </section>
  );
}

/** Until the installed packs are known: neither a pack nor first launch. */
export function SleevePending() {
  return (
    <section aria-busy="true" aria-label="Current pack" class={s.sleeve}>
      <div class={s.art} />
      <LevelTape tape={{}} />
    </section>
  );
}

export interface StarterChoice extends TilePack {
  tagline?: string;
  free: boolean;
  price: string;
}

/** First launch: pick a character, hear its starter pack, download it. */
export function FirstLaunchSleeve(props: {
  category: CategoryId;
  pack: StarterChoice | null;
  offline: boolean;
  tape: Tape;
  /** What the button does now; see firstLaunchAction. */
  action: FirstLaunchAction | null;
  previewing: { playing: boolean; loading: boolean };
  onCategory: (id: CategoryId) => void;
  onPreview: () => void;
  onDownload: () => void;
  onBuy: () => void;
}) {
  return (
    <section aria-label="Pick a sound" class={s.sleeve}>
      <div class={s.first}>
        <div class={s.top}>
          <Chips offline={props.offline} status="none" />
        </div>
        <p class={s.firstPrompt}>Pick how your keyboard should sound:</p>
        <CategoryWords
          big
          label="Sound character"
          selected={props.category}
          words={CATEGORY_IDS.map((id) => ({
            id,
            label: CATEGORY_LABELS[id],
          }))}
          onSelect={(id) => props.onCategory(id)}
        />
        <Show when={props.pack}>
          {(pack) => (
            <div class={s.starter}>
              <PackTile class={s.starterTile} pack={pack()}>
                <PreviewButton
                  loading={props.previewing.loading}
                  name={pack().name}
                  playing={props.previewing.playing}
                  onPreview={() => props.onPreview()}
                />
              </PackTile>
              <div class={ui.grow}>
                <b class={s.starterName}>{pack().name}</b>
                <p class={s.starterMeta}>
                  <Show when={pack().tagline}>
                    {(tagline) => `${tagline()} · `}
                  </Show>
                  <Show
                    fallback={<span class={ui.price}>{pack().price}</span>}
                    when={pack().free}
                  >
                    Free
                  </Show>
                </p>
              </div>
              <Show
                fallback={
                  <button
                    class={ui.button}
                    type="button"
                    onClick={() => props.onBuy()}
                  >
                    Get <kbd class={ui.buttonKbd}>enter</kbd>
                  </button>
                }
                when={pack().free}
              >
                <button
                  class={ui.button}
                  disabled={props.action !== 'download'}
                  type="button"
                  onClick={() => props.onDownload()}
                >
                  <Show fallback="Download" when={props.action === 'saving'}>
                    Saving…
                  </Show>
                  {/* Enter works only while the button does. */}
                  <Show when={props.action === 'download'}>
                    {' '}
                    <kbd class={ui.buttonKbd}>enter</kbd>
                  </Show>
                </button>
              </Show>
            </div>
          )}
        </Show>
      </div>
      <LevelTape tape={props.tape} />
    </section>
  );
}

const clamp = (value: number) =>
  Math.max(0, Math.min(MAX_VOLUME, Math.round(value)));

/** 30-segment fader, 0-150; empty while the volume is not known. */
function VolumeFader(props: {
  value: number | null;
  disabled: boolean;
  onInput: (value: number) => void;
}) {
  let track: HTMLDivElement | undefined;

  const fromPointer = (event: PointerEvent) => {
    const rect = track?.getBoundingClientRect();
    if (!rect || rect.width === 0) {
      return;
    }
    props.onInput(
      clamp(((event.clientX - rect.left) / rect.width) * MAX_VOLUME),
    );
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const step = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: 10,
      PageDown: -10,
    }[event.key];
    let next: number | undefined;
    if (step !== undefined) {
      next = (props.value ?? 0) + step;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = MAX_VOLUME;
    }
    if (next === undefined || props.disabled || props.value === null) {
      return;
    }
    event.preventDefault();
    props.onInput(clamp(next));
  };

  return (
    <div class={ui.grow}>
      <div
        ref={track}
        aria-disabled={props.disabled}
        aria-label="Volume"
        aria-valuemax={MAX_VOLUME}
        aria-valuemin={0}
        aria-valuenow={props.value ?? undefined}
        aria-valuetext={props.value === null ? 'Not loaded' : undefined}
        class={s.fader}
        role="slider"
        style={assignInlineVars({
          [s.faderLevel]: `${((props.value ?? 0) / MAX_VOLUME) * 100}%`,
        })}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (props.disabled || props.value === null || event.button !== 0) {
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          fromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            fromPointer(event);
          }
        }}
      />
      <div aria-hidden="true" class={s.scale}>
        <For each={[0, 50, 100, 150]}>
          {(mark) => (
            <span
              class={s.scaleMark}
              style={{ left: `${(mark / MAX_VOLUME) * 100}%` }}
            >
              {mark}
            </span>
          )}
        </For>
      </div>
    </div>
  );
}

export function HomeControls(props: {
  /** Null while the volume is not known. */
  volume: number | null;
  volumeLoading: boolean;
  onVolume: (volume: number) => void;
  /** Set when the volume failed to load. */
  onVolumeRetry?: () => void;
}) {
  return (
    <div class={s.controls}>
      <div class={`${s.row} ${s.volumeRow}`}>
        <div class={s.volumeNumber}>
          <span class={ui.monoLabel}>Volume</span>
          <Show
            fallback={
              <b
                class={s.volumeValue}
                classList={{ [s.volumeMuted]: props.volume === 0 }}
              >
                {props.volume}
              </b>
            }
            when={props.onVolumeRetry}
          >
            {(retry) => (
              <span class={s.volumeRetry}>
                <button
                  aria-label="Retry volume"
                  class={ui.smallButton}
                  type="button"
                  onClick={() => retry()()}
                >
                  Retry
                </button>
              </span>
            )}
          </Show>
        </div>
        <VolumeFader
          disabled={props.volumeLoading || props.volume === null}
          value={props.volume}
          onInput={(value) => props.onVolume(value)}
        />
      </div>
    </div>
  );
}

/** OFF / ON for opening KeyEcho at login. */
export function LoginToggle(props: {
  enabled: boolean;
  loading: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div aria-label="Open at login" class={s.segmented} role="group">
      <For each={[false, true]}>
        {(enabled) => (
          <button
            aria-pressed={props.enabled === enabled}
            class={s.segment}
            disabled={props.loading}
            type="button"
            onClick={() => {
              if (props.enabled !== enabled) {
                props.onChange(enabled);
              }
            }}
          >
            {enabled ? 'ON' : 'OFF'}
          </button>
        )}
      </For>
    </div>
  );
}

/** First launch only: a way past the starter choice to the whole shelf. */
export function HomeFoot(props: { count: number; onBrowse: () => void }) {
  return (
    <footer class={s.foot}>
      <span class={ui.grow} />
      <button class={ui.textLink} type="button" onClick={props.onBrowse}>
        Browse all {props.count}
      </button>
    </footer>
  );
}

/** The way into Settings, at the right end of the hint row. */
export function SettingsHint(props: { onOpen: () => void }) {
  return (
    <button
      aria-keyshortcuts="Meta+Comma"
      class={s.hintButton}
      type="button"
      onClick={() => props.onOpen()}
    >
      <kbd class={`${ui.kbd} ${s.hintKey}`}>{SETTINGS_KEYS}</kbd>
      <span class={s.hintLabel}>settings</span>
    </button>
  );
}

// The key each hint glyph stands for.
const HINT_KEYS: Record<string, string> = {
  '←': 'ArrowLeft',
  '→': 'ArrowRight',
  '↑': 'ArrowUp',
  '↓': 'ArrowDown',
  space: ' ',
  enter: 'Enter',
  esc: 'Escape',
  tab: 'Tab',
  '/': '/',
};

/** Clicking a hint does what pressing its key does. */
function pressHint(event: MouseEvent, glyph: string) {
  const key = HINT_KEYS[glyph];
  if (!key) {
    return;
  }
  // A focused button would swallow space and enter as its own click.
  (event.currentTarget as HTMLElement).blur();
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function hintItem([key, label]: readonly [string, string]) {
  const glyphs = key.split(' ');
  if (glyphs.length === 1) {
    return (
      <button
        class={s.hintButton}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => pressHint(event, key)}
      >
        <kbd class={`${ui.kbd} ${s.hintKey}`}>{key}</kbd>
        <span class={s.hintLabel}>{label}</span>
      </button>
    );
  }
  return (
    <span class={s.hintPair}>
      <kbd class={`${ui.kbd} ${s.hintKey} ${s.hintKeys}`}>
        <For each={glyphs}>
          {(glyph) => (
            <button
              aria-label={`${label} ${glyph}`}
              class={s.hintGlyph}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => pressHint(event, glyph)}
            >
              {glyph}
            </button>
          )}
        </For>
      </kbd>
      <span class={s.hintLabel}>{label}</span>
    </span>
  );
}

/** The keyboard hint row; a note replaces the keys when there is one. */
export function HintRow(props: {
  keys?: readonly (readonly [string, string])[];
  note?: string;
  trailing?: readonly (readonly [string, string])[];
  children?: JSX.Element;
}) {
  const links = children(() => props.children);
  return (
    <div class={s.hint}>
      <Show
        fallback={<For each={props.keys ?? []}>{hintItem}</For>}
        when={props.note}
      >
        {(note) => <span>{note()}</span>}
      </Show>
      <Show when={props.trailing}>
        {(trailing) => (
          <>
            <span class={ui.grow} />
            <For each={trailing()}>{hintItem}</For>
          </>
        )}
      </Show>
      <Show when={links()}>
        <span class={ui.grow} />
        {links()}
      </Show>
    </div>
  );
}

export function HomeScroll(props: { children: JSX.Element }) {
  return <div class={s.body}>{props.children}</div>;
}
