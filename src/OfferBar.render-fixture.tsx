import { renderToStringAsync } from 'solid-js/web';

import { cancelPurchase, startPackBuyFlow } from './buy';
import type { OnlineSound } from './catalog';
import type { Promo } from './offer';
import { DockOffer, SlimOffer } from './OfferBar';

const thock: OnlineSound = {
  id: 'big-key-thock',
  name: 'Big Key Thock',
  slug: 'big-key-thock',
  tier: 'paid',
  priceUsd: 3.99,
  category: 'thocky',
};
const promo: Promo = {
  name: 'Black Friday',
  code: 'BF2026',
  priceUsd: 5.99,
  endsAt: Date.parse('2026-12-03T08:00:00Z'),
  endsLabel: 'Dec 2',
};

/** The offer bars while one pack's checkout is open in the browser. */
export async function render(): Promise<string> {
  await startPackBuyFlow(
    thock,
    () => {},
    () => {},
  );
  const html = {
    dock: await renderToStringAsync(() => (
      <DockOffer paid={53} promo={undefined} onGet={() => {}} />
    )),
    slim: await renderToStringAsync(() => (
      <SlimOffer promo={promo} onGet={() => {}} />
    )),
  };
  cancelPurchase();
  return JSON.stringify(html);
}
