export type ToastTone = 'default' | 'error';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface NotifyOptions {
  tone?: ToastTone;
  /** Raw technical reason, folded behind a Details disclosure. */
  details?: string;
  /** A toast carrying an action stays until it is clicked. */
  action?: ToastAction;
}

export type Notify = (message: string, options?: NotifyOptions) => void;

export interface Toast extends NotifyOptions {
  id: string;
  message: string;
}

/**
 * The list after `toast` arrives. A repeat of a message still on screen
 * replaces it, so failing the same thing again does not stack another toast.
 */
export function withToast(toasts: readonly Toast[], toast: Toast): Toast[] {
  return [...toasts.filter((item) => item.message !== toast.message), toast];
}
