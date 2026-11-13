import { createSignal } from 'solid-js';

export const ALL_ACCESS_PRICE_USD = 9.99;
export const SINGLE_PACK_PRICE_USD = 3.99;

/** A time-limited All Sounds Forever price, as the pack catalog serves it. */
export interface ServedOffer {
  name: string;
  code: string;
  priceUsd: number;
  endsAt: string;
}

export interface Promo {
  name: string;
  code: string;
  priceUsd: number;
  endsAt: number;
  endsLabel: string;
}

// The offer's last day, in the zone its end instant is set in.
function lastDayLabel(endsAt: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).format(endsAt - 1);
}

/** The served offer while it runs; undefined once it has ended or is unreadable. */
export function promoFrom(
  offer: ServedOffer | undefined,
  now: number,
): Promo | undefined {
  if (!offer) {
    return undefined;
  }
  const endsAt = Date.parse(offer.endsAt);
  if (!(now < endsAt)) {
    return undefined;
  }
  return {
    name: offer.name,
    code: offer.code,
    priceUsd: offer.priceUsd,
    endsAt,
    endsLabel: lastDayLabel(endsAt),
  };
}

const [servedOffer, setServedOffer] = createSignal<ServedOffer>();

/** Called with each catalog load; no offer is shown before the first one. */
export { setServedOffer };

export function activeAllAccessPromo(now: number): Promo | undefined {
  return promoFrom(servedOffer(), now);
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
