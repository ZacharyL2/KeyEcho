import { For } from 'solid-js';

import * as s from './CategoryWords.css';

/** A row of serif words; one is picked and underlined in its accent. */
export function CategoryWords<T extends string>(props: {
  label: string;
  words: readonly { id: T; label: string }[];
  selected: T | null;
  big?: boolean;
  greyed?: boolean;
  class?: string;
  onSelect: (id: T) => void;
}) {
  return (
    <div
      aria-label={props.label}
      class={`${s.words} ${props.class ?? ''}`}
      classList={{ [s.big]: props.big, [s.greyed]: props.greyed }}
      role="group"
    >
      <For each={props.words}>
        {(word) => (
          <button
            aria-pressed={word.id === props.selected}
            class={s.word}
            type="button"
            onClick={() => props.onSelect(word.id)}
          >
            {word.label}
          </button>
        )}
      </For>
    </div>
  );
}
