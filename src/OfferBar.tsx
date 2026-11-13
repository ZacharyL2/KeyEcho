import { Match, Show, Switch } from 'solid-js';

import { cancelPurchase, pendingPurchase } from './buy';
import type { Promo as ActivePromo } from './offer';
import { ALL_ACCESS_PRICE_USD, formatUsd } from './offer';
import * as s from './OfferBar.css';
import * as ui from './styles/controls.css';

type Promo = ActivePromo | undefined;

export const ALL_ACCESS_NAME = 'All Sounds Forever';

export function allAccessCopy(paid: number | undefined): string {
  return paid
    ? `All ${paid} paid packs and every future one.`
    : 'Every paid pack and every future one.';
}

function waitingForAll(): boolean {
  return pendingPurchase()?.kind === 'all';
}

/** The pack whose own checkout is open; it keeps this offer's Get it waiting. */
function waitingPackName(): string | null {
  const pending = pendingPurchase();
  return pending?.kind === 'pack' ? pending.pack.name : null;
}

function Amount(props: { promo: Promo; class: string }) {
  return (
    <span class={props.class}>
      <Show when={props.promo}>
        <s class={s.was}>{formatUsd(ALL_ACCESS_PRICE_USD)}</s>
      </Show>
      {formatUsd(props.promo?.priceUsd ?? ALL_ACCESS_PRICE_USD)}
    </span>
  );
}

function GetButton(props: { slim?: boolean; ink: boolean; onGet: () => void }) {
  return (
    <button
      class={
        props.slim
          ? s.getButton.inkSlim
          : props.ink
            ? s.getButton.ink
            : s.getButton.regular
      }
      disabled={pendingPurchase() !== null}
      title="Pay on keyecho.app · unlocks here automatically"
      type="button"
      onClick={() => props.onGet()}
    >
      <Show fallback="Get it" when={waitingForAll()}>
        Waiting for keyecho.app…
      </Show>
    </button>
  );
}

/** The Home bar: only while the promo runs. */
export function SlimOffer(props: {
  promo: NonNullable<Promo>;
  onGet: () => void;
}) {
  return (
    <section aria-label={props.promo.name} class={s.bar.slim}>
      <span class={s.slimLine}>
        <b class={s.slimTitle} title={props.promo.name}>
          {props.promo.name}
        </b>
        <Show
          fallback={
            <span class={s.slimRest}>
              {' · '}
              {ALL_ACCESS_NAME} · code{' '}
              <span class={ui.promoCode}>{props.promo.code}</span>
              <Show when={waitingForAll()}>
                {' · '}
                <button class={s.cancel} type="button" onClick={cancelPurchase}>
                  Cancel
                </button>
              </Show>
            </span>
          }
          when={waitingPackName()}
        >
          {(name) => (
            <span class={s.slimRest}>
              {' · '}Finish buying {name()} in your browser ·{' '}
              <button class={s.cancel} type="button" onClick={cancelPurchase}>
                Cancel
              </button>
            </span>
          )}
        </Show>
      </span>
      <Amount class={s.amount.onInkSlim} promo={props.promo} />
      <GetButton ink slim onGet={props.onGet} />
    </section>
  );
}

/** The Packs dock offer: ink during the promo, the plain $9.99 offer after. */
export function DockOffer(props: {
  promo: Promo;
  paid: number | undefined;
  onGet: () => void;
}) {
  return (
    <section
      aria-label={ALL_ACCESS_NAME}
      class={props.promo ? s.bar.dock : s.bar.dockRegular}
    >
      <div class={ui.grow}>
        <Show when={props.promo}>
          {(promo) => (
            <span class={s.eyebrow}>
              {promo().name} · through {promo().endsLabel}
            </span>
          )}
        </Show>
        <b class={s.title}>{ALL_ACCESS_NAME}</b>
        <p class={s.copy}>
          <Switch
            fallback={
              <>
                {allAccessCopy(props.paid)}
                <Show when={props.promo}>
                  {(promo) => (
                    <>
                      {' '}
                      Code <span class={ui.promoCode}>{promo().code}</span>
                    </>
                  )}
                </Show>
              </>
            }
          >
            <Match when={waitingForAll()}>
              Finish the purchase in your browser ·{' '}
              <button class={s.cancel} type="button" onClick={cancelPurchase}>
                Cancel
              </button>
            </Match>
            <Match when={waitingPackName()}>
              {(name) => (
                <>
                  Finish buying {name()} in your browser ·{' '}
                  <button
                    class={s.cancel}
                    type="button"
                    onClick={cancelPurchase}
                  >
                    Cancel
                  </button>
                </>
              )}
            </Match>
          </Switch>
        </p>
      </div>
      <Amount
        class={props.promo ? s.amount.onInk : s.amount.regular}
        promo={props.promo}
      />
      <GetButton ink={props.promo !== undefined} onGet={props.onGet} />
    </section>
  );
}
