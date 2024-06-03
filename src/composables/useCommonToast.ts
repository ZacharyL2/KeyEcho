import { capitalize } from 'lodash-es';
import type { ToastMessageOptions } from 'primevue/toast';

export function useCommonToast() {
  const toast = useToast();

  const showToast = (opts: ToastMessageOptions) => {
    const { severity = 'info' } = opts;

    toast.add({
      summary: capitalize(severity),
      life: 3000,
      severity,
      ...opts,
    });
  };

  return {
    showToast,
  };
}
