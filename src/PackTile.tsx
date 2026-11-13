import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

import type { CoverSize } from './cover';
import { packCover } from './cover';
import { Icon } from './Icon';
import { tintFor } from './packs';
import * as s from './PackTile.css';
import * as ui from './styles/controls.css';
import { categoryTint } from './styles/tokens.css';

export interface TilePack {
  id: string;
  name: string;
  category?: string;
}

/** A pack's cover on its category tint; the name stands in until a cover loads. */
export function PackTile(props: {
  pack: TilePack;
  size?: CoverSize;
  /** False for installed packs outside the catalog: there is no cover to fetch. */
  hasCover?: boolean;
  selected?: boolean;
  class?: string;
  children?: JSX.Element;
}) {
  const cover = () =>
    props.hasCover === false
      ? null
      : packCover(props.pack.id, props.size ?? 'small')();

  return (
    <div
      class={`${s.tile} ${categoryTint[tintFor(props.pack.category)]} ${props.class ?? ''}`}
      classList={{ [s.selected]: props.selected }}
    >
      <Show
        fallback={
          <span aria-hidden="true" class={s.fallback}>
            {props.pack.name}
          </span>
        }
        when={cover()}
      >
        {(src) => <img alt="" class={s.cover} src={src()} />}
      </Show>
      {props.children}
    </div>
  );
}

export function PreviewButton(props: {
  name: string;
  playing: boolean;
  loading: boolean;
  onPreview: () => void;
}) {
  return (
    <button
      aria-busy={props.loading}
      aria-label={
        props.playing
          ? `Stop preview of ${props.name}`
          : `Preview ${props.name}`
      }
      class={s.play}
      title={props.playing ? 'Stop' : 'Hear a few keys'}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        props.onPreview();
      }}
    >
      <Icon
        class={props.loading ? ui.spinning : undefined}
        name={props.loading ? 'loading' : props.playing ? 'stop' : 'play'}
      />
    </button>
  );
}
