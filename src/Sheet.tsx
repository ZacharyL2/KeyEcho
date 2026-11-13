import type { JSX } from 'solid-js';
import { onCleanup, onMount } from 'solid-js';

import { Icon } from './Icon';
import * as s from './Sheet.css';
import * as ui from './styles/controls.css';

/**
 * A bottom sheet over a scrim; esc and a click on the scrim close it. Toasts
 * render inside the dialog, so its focus trap reaches their buttons.
 */
export function Sheet(props: {
  label: string;
  onClose: () => void;
  toasts?: JSX.Element;
  children: JSX.Element;
}) {
  let panel: HTMLDivElement | undefined;
  const opener =
    typeof document === 'undefined' ? null : document.activeElement;

  onMount(() => {
    const first =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('input, button:not(:disabled)');
    (first ?? panel)?.focus();
  });
  onCleanup(() => {
    // After this tick the page behind is no longer inert and can take focus.
    queueMicrotask(() => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    });
  });

  return (
    <>
      <div aria-hidden="true" class={s.scrim} onClick={() => props.onClose()} />
      <div
        ref={panel}
        aria-label={props.label}
        aria-modal="true"
        class={s.sheet}
        role="dialog"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.isComposing) {
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            props.onClose();
          } else if (event.key === 'Tab' && panel) {
            // Keep focus inside the sheet.
            const items = [
              ...panel.querySelectorAll<HTMLElement>(
                'input, button:not(:disabled), summary, [tabindex="0"]',
              ),
            ];
            const first = items[0];
            const last = items.at(-1);
            if (!first || !last) {
              return;
            }
            // From the panel itself, or after the focused button went away,
            // wrap too rather than letting focus leave the sheet.
            const at = items.indexOf(document.activeElement as HTMLElement);
            if (event.shiftKey && at <= 0) {
              event.preventDefault();
              last.focus();
            } else if (
              !event.shiftKey &&
              (at === -1 || at === items.length - 1)
            ) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        {props.toasts}
        <div class={s.body}>
          {props.children}
          {/* Last in the DOM, so opening focus still lands on the content. */}
          <button
            aria-label="Close"
            class={s.close}
            type="button"
            onClick={() => props.onClose()}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>
    </>
  );
}

export function SheetFine(props: { children: JSX.Element; keys?: string }) {
  return (
    <p class={s.fine}>
      <span class={ui.grow}>{props.children}</span>
      <span class={s.fineKeys}>
        <kbd class={ui.kbd}>esc</kbd>
        {props.keys ?? 'close'}
      </span>
    </p>
  );
}
