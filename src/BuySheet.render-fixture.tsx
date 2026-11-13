import { renderToStringAsync } from 'solid-js/web';

import { cancelPurchase, startBuyFlow, startPackBuyFlow } from './buy';
import { BuySheet } from './BuySheet';
import type { OnlineSound } from './catalog';

const pack = (slug: string, name: string, priceUsd: number): OnlineSound => ({
  id: slug,
  name,
  slug,
  tier: 'paid',
  priceUsd,
  category: 'thocky',
});
const retro = pack('retro-enter', 'Retro Enter', 2.99);
const thock = pack('big-key-thock', 'Big Key Thock', 4.99);

const sheetOn = (opened: OnlineSound | null) =>
  renderToStringAsync(() => (
    <BuySheet
      campaign="render_test"
      notify={() => {}}
      openLicense={() => {}}
      pack={opened}
      paid={53}
      promo={undefined}
      onClose={() => {}}
    />
  ));

/** The Buy sheet's HTML through one checkout of each kind, by moment. */
export async function render(): Promise<string> {
  const html: Record<string, string> = {};
  await startPackBuyFlow(
    retro,
    () => {},
    () => {},
  );
  html.ownPackPending = await sheetOn(retro);
  html.otherPackWhilePackPending = await sheetOn(thock);
  cancelPurchase();
  html.otherPackAfterCancel = await sheetOn(thock);
  await startBuyFlow(
    () => {},
    () => {},
  );
  html.packWhileAllPending = await sheetOn(thock);
  cancelPurchase();
  return JSON.stringify(html);
}
