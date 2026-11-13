import type { JSX } from 'solid-js';
import {
  createEffect,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from 'solid-js';

import { CategoryWords } from './CategoryWords';
import { Icon } from './Icon';
import { formatUsd } from './offer';
import type { PackCard } from './pack-cards';
import type { PackShelf } from './packs';
import { CATEGORY_LABELS, isCategoryId, PACK_SHELVES, tintFor } from './packs';
import * as s from './PacksPage.css';
import { PackTile, PreviewButton } from './PackTile';
import type { Preview } from './preview';
import { categoryTint } from './styles/tokens.css';
import * as ui from './styles/controls.css';

/** Where the pack stands: price, free, owned, installed or in use. */
function CardStatus(props: { card: PackCard; downloading: boolean }) {
  return (
    <Switch>
      <Match when={props.downloading}>
        <span class={s.status}>Saving…</span>
      </Match>
      <Match when={props.card.action === 'in-use'}>
        <span class={`${s.status} ${s.inUse}`}>In use</span>
      </Match>
      <Match when={props.card.action === 'use'}>
        <span class={s.status}>Installed</span>
      </Match>
      <Match when={props.card.action === 'download-owned'}>
        <span class={s.status}>Owned</span>
      </Match>
      <Match when={props.card.action === 'download'}>
        <span class={s.status}>Free</span>
      </Match>
      <Match when={props.card.action === 'buy'}>
        <span class={`${ui.price} ${s.cardPrice}`}>
          {formatUsd(props.card.online?.priceUsd ?? 0)}
        </span>
      </Match>
    </Switch>
  );
}

function shelfLabel(shelf: PackShelf): string {
  return shelf === 'yours' ? 'Yours' : CATEGORY_LABELS[shelf];
}

export type PacksState = 'loading' | 'failed' | 'empty' | 'ready';

export function PacksPage(props: {
  shelf: PackShelf;
  query: string;
  cards: PackCard[];
  selected: number;
  state: PacksState;
  totalCount: number | null;
  offline: boolean;
  counts: { free: number; paid: number } | null;
  downloadingId: string | null;
  preview: Preview;
  dock: JSX.Element;
  searchRef: (element: HTMLInputElement) => void;
  onShelf: (shelf: PackShelf) => void;
  onQuery: (query: string) => void;
  onBack: () => void;
  onSelect: (index: number) => void;
  onAction: (card: PackCard) => void;
  onRetry: () => void;
  onSoundsFolder: () => void;
}) {
  let grid: HTMLDivElement | undefined;
  let scroller: HTMLDivElement | undefined;
  const searching = () => props.query.trim() !== '';
  const needsCatalog = () => searching() || props.shelf !== 'yours';

  const showSelected = (index: number) =>
    grid
      ?.querySelector(`[data-card="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' });

  createEffect(() => showSelected(props.selected));

  // A toast arriving in the dock shrinks the list; keep the selected card in view.
  onMount(() => {
    if (!scroller) {
      return;
    }
    const observer = new ResizeObserver(() => showSelected(props.selected));
    observer.observe(scroller);
    onCleanup(() => observer.disconnect());
  });

  const subline = () => {
    const count = props.cards.length;
    if (searching()) {
      return 'Results from every character';
    }
    if (props.shelf === 'yours') {
      // An empty Yours says so below; no count above it.
      return count === 0
        ? ''
        : `${count} pack${count === 1 ? '' : 's'} installed`;
    }
    const free = props.cards.filter((card) => card.online?.tier === 'free');
    return `${count} pack${count === 1 ? '' : 's'}${free.length ? ` · ${free.length} free` : ''}`;
  };

  return (
    <div class={s.page}>
      <div class={s.find}>
        <button
          aria-keyshortcuts="Escape"
          aria-label="Back"
          class={s.back}
          type="button"
          onClick={() => props.onBack()}
        >
          <Icon name="back" />
        </button>
        <Icon class={s.searchIcon} name="search" />
        <input
          ref={props.searchRef}
          aria-keyshortcuts="/"
          aria-label="Search packs"
          autocomplete="off"
          class={s.query}
          placeholder={
            props.totalCount
              ? `Search ${props.totalCount} packs`
              : 'Search packs'
          }
          spellcheck={false}
          type="search"
          value={props.query}
          onInput={(event) => props.onQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              if (props.query) {
                props.onQuery('');
              } else {
                props.onBack();
              }
            } else if (event.key === 'ArrowDown' || event.key === 'Enter') {
              // Hand the keys over to the grid.
              event.preventDefault();
              event.currentTarget.blur();
              props.onSelect(Math.max(props.selected, 0));
            }
          }}
        />
        <Show when={searching()}>
          <span class={ui.monoLabel}>
            {props.cards.length} result{props.cards.length === 1 ? '' : 's'}
          </span>
        </Show>
        <Show when={props.offline}>
          <span class={ui.chip.off}>Offline</span>
        </Show>
        <kbd class={ui.kbd}>{searching() ? 'esc' : '/'}</kbd>
      </div>

      <div ref={scroller} class={s.scroll}>
        <CategoryWords
          class={s.words}
          greyed={searching()}
          label="Sound character"
          selected={searching() ? null : props.shelf}
          words={PACK_SHELVES.map((id) => ({ id, label: shelfLabel(id) }))}
          onSelect={(shelf) => {
            props.onQuery('');
            props.onShelf(shelf);
          }}
        />

        <Show
          fallback={
            <div class={s.state}>
              <Switch>
                <Match when={props.state === 'loading'}>
                  <b class={s.stateTitle}>Loading packs</b>
                </Match>
                <Match when={props.state === 'failed'}>
                  <b class={s.stateTitle}>Pack list didn't load</b>
                  <span>
                    Can't reach keyecho.app right now. Installed packs still
                    play.
                  </span>
                  <button
                    class={ui.button}
                    type="button"
                    onClick={() => props.onRetry()}
                  >
                    Retry
                  </button>
                </Match>
                <Match when={props.state === 'empty'}>
                  <b class={s.stateTitle}>No packs online right now</b>
                  <button
                    class={ui.button}
                    type="button"
                    onClick={() => props.onRetry()}
                  >
                    Retry
                  </button>
                </Match>
              </Switch>
            </div>
          }
          when={!needsCatalog() || props.state === 'ready'}
        >
          <div class={s.sub}>
            <span>{subline()}</span>
            <Show when={!searching() && props.shelf === 'yours'}>
              <button
                class={`${ui.monoLabel} ${s.subEnd}`}
                type="button"
                onClick={() => props.onSoundsFolder()}
              >
                Sounds folder
              </button>
            </Show>
            <Show
              when={!searching() && props.shelf !== 'yours' && props.counts}
            >
              {(counts) => (
                <span class={`${ui.monoLabel} ${s.subEnd}`}>
                  {counts().free} free · {counts().paid} paid in all
                </span>
              )}
            </Show>
          </div>

          <Show
            fallback={
              <div class={s.state}>
                <b class={s.stateTitle}>
                  <Show fallback="No packs yet" when={searching()}>
                    No packs match "{props.query.trim()}"
                  </Show>
                </b>
              </div>
            }
            when={props.cards.length > 0}
          >
            <div ref={grid} class={s.grid}>
              <For each={props.cards}>
                {(card, index) => (
                  <div
                    class={`${s.card} ${categoryTint[tintFor(card.category)]}`}
                    classList={{ [s.cardActive]: card.action !== 'in-use' }}
                    data-card={index()}
                    onClick={() => {
                      props.onSelect(index());
                      if (
                        card.action !== 'in-use' &&
                        props.downloadingId !== card.online?.id
                      ) {
                        props.onAction(card);
                      }
                    }}
                  >
                    <PackTile
                      hasCover={card.online !== undefined}
                      pack={{
                        id: card.online?.id ?? card.key,
                        name: card.name,
                        category: card.category,
                      }}
                      selected={index() === props.selected}
                    >
                      <Show when={card.online}>
                        {(online) => (
                          <PreviewButton
                            loading={props.preview.loadingId() === online().id}
                            name={card.name}
                            playing={props.preview.playingId() === online().id}
                            onPreview={() => {
                              props.onSelect(index());
                              void props.preview.preview(online().id);
                            }}
                          />
                        )}
                      </Show>
                    </PackTile>
                    <Show when={searching() && isCategoryId(card.category)}>
                      <span class={s.cardTag}>
                        {isCategoryId(card.category)
                          ? CATEGORY_LABELS[card.category]
                          : ''}
                      </span>
                    </Show>
                    <div class={s.nameRow}>
                      <b class={s.cardName} title={card.name}>
                        {card.name}
                      </b>
                      <CardStatus
                        card={card}
                        downloading={props.downloadingId === card.online?.id}
                      />
                    </div>
                    <Show when={props.preview.failedId() === card.online?.id}>
                      <span class={s.note}>Preview didn't load</span>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>

      <div class={s.dock}>{props.dock}</div>
    </div>
  );
}
