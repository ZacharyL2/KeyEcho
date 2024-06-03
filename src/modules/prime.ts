import PrimeVue from 'primevue/config';
import Ripple from 'primevue/ripple';
import ToastService from 'primevue/toastservice';
import Tooltip from 'primevue/tooltip';

import Lara from '@/presets/lara';
import type { UserModule } from '@/types/app';

// https://tailwind.primevue.org
export const install: UserModule = ({ app }) => {
  app.use(PrimeVue, {
    pt: Lara,
    ripple: true,
    unstyled: true,
  });

  app.use(ToastService);

  app.directive('ripple', Ripple);
  app.directive('tooltip', Tooltip);
};
