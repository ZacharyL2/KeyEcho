import { createEffect, createSignal, For, on, Show } from 'solid-js';

import { Icon } from './Icon';
import type { Notify, Toast } from './notify';
import { withToast } from './notify';
import * as s from './Toasts.css';

export function createNotifier() {
  const [toasts, setToasts] = createSignal<Toast[]>([]);

  const removeToast = (id: string) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  };

  const notify: Notify = (message, options) => {
    const id =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToasts((items) => withToast(items, { id, message, ...options }));
    // A toast offering an action waits for it; the rest fade on their own.
    if (!options?.action) {
      window.setTimeout(removeToast, 2400, id);
    }
  };

  return { notify, removeToast, toasts };
}

/**
 * The notification region: in the window's flow above the bottom bars, or at
 * the top of an open sheet's dialog. Its height is bounded; past that it
 * scrolls, keeping the newest toast in view.
 */
export function Toasts(props: {
  toasts: () => Toast[];
  removeToast: (id: string) => void;
  placement: 'flow' | 'sheet';
}) {
  let region: HTMLDivElement | undefined;
  createEffect(
    on(
      () => props.toasts().length,
      (count, previous) => {
        if (region && count > (previous ?? 0)) {
          region.scrollTop = region.scrollHeight;
        }
      },
    ),
  );

  return (
    <div ref={region} aria-live="polite" class={s.toastStack[props.placement]}>
      <For each={props.toasts()}>
        {(toast) => (
          <div
            class={s.toastCard}
            role={toast.tone === 'error' ? 'alert' : undefined}
          >
            <p class={s.toastMessage}>{toast.message}</p>
            <div class={s.toastActions}>
              <Show when={toast.action}>
                {(action) => (
                  <button
                    class={s.toastAction}
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
                class={s.dismiss}
                type="button"
                onClick={() => props.removeToast(toast.id)}
              >
                <Icon name="close" />
              </button>
            </div>
            <Show when={toast.details}>
              {(details) => (
                <details class={s.toastDetails}>
                  <summary class={s.detailsSummary}>Details</summary>
                  <p class={s.detailsText}>{details()}</p>
                </details>
              )}
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}
