import { renderToStringAsync } from 'solid-js/web';

import { BuySheet } from './BuySheet';
import { LicenseSheet } from './LicenseSheet';
import type { Toast } from './notify';
import { Toasts } from './Toasts';

const failed: Toast[] = [
  {
    id: 'download-failed',
    message: 'Creamy Thock didn’t download',
    tone: 'error',
    details: 'Error: download_sound failed',
    action: { label: 'Retry', run: () => {} },
  },
];

const toasts = () => (
  <Toasts placement="sheet" removeToast={() => {}} toasts={() => failed} />
);

/** Each sheet's HTML while a toast with Retry is up. */
export async function render(): Promise<string> {
  const html = {
    license: await renderToStringAsync(() => (
      <LicenseSheet
        notify={() => {}}
        toasts={toasts()}
        onClose={() => {}}
        onSoundsChanged={() => {}}
      />
    )),
    buy: await renderToStringAsync(() => (
      <BuySheet
        campaign="render_test"
        notify={() => {}}
        openLicense={() => {}}
        pack={null}
        paid={53}
        promo={undefined}
        toasts={toasts()}
        onClose={() => {}}
      />
    )),
  };
  return JSON.stringify(html);
}
