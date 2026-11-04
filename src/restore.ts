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
