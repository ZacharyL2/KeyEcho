import { createSignal } from 'solid-js';

import { KEYECHO_ORIGIN } from './origin';

const RESTORE_URL = `${KEYECHO_ORIGIN}/packs/restore`;

// The store answers {sent:true} for any well-formed address, purchases or not,
// so only an HTTP error or another body is a failure worth reporting.
export async function requestRestoreEmail(email: string): Promise<void> {
  const response = await fetch(RESTORE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw new Error(`restore failed: HTTP ${response.status}`);
  }
  const body = (await response.json().catch(() => null)) as {
    sent?: unknown;
  } | null;
  if (body?.sent !== true) {
    throw new Error('restore failed: email not sent');
  }
}

export type RestoreState =
  | { kind: 'idle' }
  | { kind: 'missing' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'failed'; details: string };

/**
 * The License sheet's "send my keys" form: the typed address and the last
 * request's outcome, which the sheet shows beside the email field. Editing
 * the address or `clear()` drops an outcome that no longer applies.
 */
export function createRestoreRequest(send = requestRestoreEmail) {
  const [email, setAddress] = createSignal('');
  const [state, setState] = createSignal<RestoreState>({ kind: 'idle' });

  const clear = () => {
    if (state().kind !== 'sending') {
      setState({ kind: 'idle' });
    }
  };

  const setEmail = (next: string) => {
    setAddress(next);
    clear();
  };

  const submit = async () => {
    const address = email().trim();
    if (state().kind === 'sending') {
      return;
    }
    if (!address) {
      setState({ kind: 'missing' });
      return;
    }
    setState({ kind: 'sending' });
    try {
      await send(address);
      setState({ kind: 'sent' });
    } catch (error) {
      setState({ kind: 'failed', details: String(error) });
    }
  };

  return { clear, email, setEmail, state, submit };
}
