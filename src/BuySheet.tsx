import type { JSX } from 'solid-js';
import { createSignal, For, Show } from 'solid-js';

import {
  cancelPurchase,
  pendingPurchase,
  startBuyFlow,
  startPackBuyFlow,
} from './buy';
import * as s from './BuySheet.css';
import type { OnlineSound } from './catalog';
import type { Notify } from './notify';
import type { Promo as ActivePromo } from './offer';
import {
  ALL_ACCESS_PRICE_USD,
  formatUsd,
  SINGLE_PACK_PRICE_USD,
} from './offer';
import { ALL_ACCESS_NAME, allAccessCopy } from './OfferBar';
import { CATEGORY_LABELS, isCategoryId } from './packs';
import { PackTile } from './PackTile';
import { Sheet, SheetFine } from './Sheet';
import * as ui from './styles/controls.css';

type Promo = ActivePromo | undefined;

function categoryLabel(category: string | undefined): string {
  return isCategoryId(category) ? CATEGORY_LABELS[category] : '';
}
type Choice = 'pack' | 'all';

function AllAccessAmount(props: { promo: Promo; class?: string }) {
  return (
    <span class={props.class ?? ui.amount}>
      <Show when={props.promo}>
        <s class={s.optionWas}>{formatUsd(ALL_ACCESS_PRICE_USD)}</s>
      </Show>
      {formatUsd(props.promo?.priceUsd ?? ALL_ACCESS_PRICE_USD)}
    </span>
  );
}

/**
 * Buying: one pack or All Sounds Forever, paid on keyecho.app. While the
 * browser checkout is open the sheet waits for the key.
 */
export function BuySheet(props: {
  /** The pack Get was pressed on; none when the offer itself was chosen. */
  pack: OnlineSound | null;
  promo: Promo;
  paid: number | undefined;
  campaign: string;
  notify: Notify;
  toasts?: JSX.Element;
  openLicense: () => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = createSignal<Choice>('all');
  // While a checkout is open the sheet shows what it buys, even when opened on
  // another pack: one checkout at a time, and Cancel leads back to this pack.
  const shown = (): OnlineSound | null => {
    const pending = pendingPurchase();
    if (!pending) {
      return props.pack;
    }
    return pending.kind === 'pack' ? pending.pack : null;
  };
  const packPrice = () => formatUsd(shown()?.priceUsd ?? SINGLE_PACK_PRICE_USD);

  const proceed = () => {
    const pack = props.pack;
    if (pack && choice() === 'pack') {
      void startPackBuyFlow(pack, props.notify, props.openLicense, {
        campaign: props.campaign,
        content: pack.slug,
      });
    } else {
      void startBuyFlow(props.notify, props.openLicense, {
        campaign: props.campaign,
        content: pack?.slug,
      });
    }
  };

  const title = () => shown()?.name ?? ALL_ACCESS_NAME;

  const options = () =>
    props.pack ? (['pack', 'all'] as const) : (['all'] as const);

  return (
    <Sheet label="Buy" toasts={props.toasts} onClose={props.onClose}>
      <div class={s.what}>
        <Show when={shown()}>
          {(pack) => <PackTile class={s.whatTile} pack={pack()} />}
        </Show>
        <div>
          <b class={s.whatName}>{title()}</b>
          <p class={s.whatCopy}>
            <Show
              fallback={
                <Show
                  fallback={
                    <span class={`${ui.price} ${s.whatPrice}`}>
                      {packPrice()}
                    </span>
                  }
                  when={!shown()}
                >
                  <span class={`${ui.price} ${s.whatPrice}`}>
                    {formatUsd(props.promo?.priceUsd ?? ALL_ACCESS_PRICE_USD)}
                  </span>
                  <Show when={props.promo}>
                    {(promo) => ` with code ${promo().code}`}
                  </Show>
                </Show>
              }
              when={!pendingPurchase()}
            >
              <Show fallback={allAccessCopy(props.paid)} when={shown()}>
                {(pack) => pack().tagline ?? categoryLabel(pack().category)}
              </Show>
            </Show>
          </p>
        </div>
      </div>

      <Show
        fallback={
          <>
            <div aria-live="polite" class={s.wait}>
              <i class={ui.spinner} />
              <span class={ui.grow}>
                Pay on keyecho.app · unlocks here automatically
              </span>
              <button
                class={ui.smallButton}
                type="button"
                onClick={cancelPurchase}
              >
                Cancel
              </button>
            </div>
            <SheetFine>The checkout page is open in your browser.</SheetFine>
          </>
        }
        when={!pendingPurchase()}
      >
        <div aria-label="What to buy" class={s.options} role="radiogroup">
          <For each={options()}>
            {(option) => (
              <button
                aria-checked={choice() === option}
                class={s.option}
                role="radio"
                type="button"
                onClick={() => setChoice(option)}
                onKeyDown={(event) => {
                  // Enter continues from the options too, as its keycap says.
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    proceed();
                  } else if (
                    props.pack &&
                    [
                      'ArrowLeft',
                      'ArrowRight',
                      'ArrowUp',
                      'ArrowDown',
                    ].includes(event.key)
                  ) {
                    event.preventDefault();
                    const next = choice() === 'pack' ? 'all' : 'pack';
                    setChoice(next);
                    event.currentTarget.parentElement
                      ?.querySelector<HTMLElement>(`[data-option="${next}"]`)
                      ?.focus();
                  }
                }}
                data-option={option}
              >
                <span class={s.optionTop}>
                  {option === 'pack' ? 'This pack' : ALL_ACCESS_NAME}
                  <span class={s.radio} />
                </span>
                <Show
                  fallback={
                    <>
                      <AllAccessAmount
                        class={s.optionAmount}
                        promo={props.promo}
                      />
                      <span class={s.optionCopy}>
                        {allAccessCopy(props.paid)}
                      </span>
                      <Show when={props.promo}>
                        {(promo) => (
                          <span class={s.optionTerms}>
                            Code {promo().code} · through {promo().endsLabel}
                          </span>
                        )}
                      </Show>
                    </>
                  }
                  when={option === 'pack'}
                >
                  <span class={s.optionAmount}>{packPrice()}</span>
                  <span class={s.optionCopy}>{props.pack?.name} only.</span>
                </Show>
              </button>
            )}
          </For>
        </div>
        <button
          class={s.continueButton}
          data-autofocus
          type="button"
          onClick={proceed}
        >
          Continue on keyecho.app <kbd class={ui.buttonKbd}>enter</kbd>
        </button>
        <SheetFine keys="cancel">
          Pay in your browser. It unlocks here by itself. 14-day refund.
        </SheetFine>
      </Show>
    </Sheet>
  );
}
