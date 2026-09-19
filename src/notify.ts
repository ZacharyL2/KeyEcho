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
