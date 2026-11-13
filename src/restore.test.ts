import { afterEach, expect, test, vi } from 'vitest';

import { createRestoreRequest, requestRestoreEmail } from './restore';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubRestoreResponse(response: Response) {
  vi.stubGlobal('fetch', async () => response);
}

test('a restore the store accepted resolves', async () => {
  stubRestoreResponse(Response.json({ sent: true }));

  await expect(requestRestoreEmail('a@example.com')).resolves.toBeUndefined();
});

test('a restore that fails on the server is reported as a failure', async () => {
  stubRestoreResponse(
    Response.json({ error: 'not_configured' }, { status: 503 }),
  );

  await expect(requestRestoreEmail('a@example.com')).rejects.toThrow(
    'HTTP 503',
  );
});

test('a restore the store did not send is reported as a failure', async () => {
  stubRestoreResponse(Response.json({ sent: false }));

  await expect(requestRestoreEmail('a@example.com')).rejects.toThrow();
});

// A send that fails until `down` is cleared, recording every address.
function fakeSend() {
  const sent = { down: true, addresses: [] as string[] };
  const send = async (email: string) => {
    sent.addresses.push(email);
    if (sent.down) {
      throw new Error('restore failed: HTTP 503');
    }
  };
  return { sent, send };
}

test('a failed send is kept as a failure beside the field, with the email', async () => {
  const { send } = fakeSend();
  const restore = createRestoreRequest(send);
  restore.setEmail('demo@example.com');

  await restore.submit();

  expect(restore.state()).toEqual({
    kind: 'failed',
    details: 'Error: restore failed: HTTP 503',
  });
  expect(restore.email()).toBe('demo@example.com');
});

test('retrying a failed send sends the same address and confirms it', async () => {
  const { sent, send } = fakeSend();
  const restore = createRestoreRequest(send);
  restore.setEmail(' demo@example.com ');
  await restore.submit();

  sent.down = false;
  await restore.submit();

  expect(sent.addresses).toEqual(['demo@example.com', 'demo@example.com']);
  expect(restore.state()).toEqual({ kind: 'sent' });
});

test('an empty email sends nothing and says the email is missing', async () => {
  const { sent, send } = fakeSend();
  const restore = createRestoreRequest(send);
  restore.setEmail('   ');

  await restore.submit();

  expect(sent.addresses).toEqual([]);
  expect(restore.state()).toEqual({ kind: 'missing' });
});

test('editing the email drops the last outcome beside the field', async () => {
  const { sent, send } = fakeSend();
  const restore = createRestoreRequest(send);
  await restore.submit();
  expect(restore.state()).toEqual({ kind: 'missing' });

  restore.setEmail('d');
  expect(restore.state()).toEqual({ kind: 'idle' });

  sent.down = false;
  restore.setEmail('demo@example.com');
  await restore.submit();
  restore.setEmail('other@example.com');
  expect(restore.state()).toEqual({ kind: 'idle' });
});

test('clear() drops a sent outcome once the key field is used', async () => {
  const { sent, send } = fakeSend();
  sent.down = false;
  const restore = createRestoreRequest(send);
  restore.setEmail('demo@example.com');
  await restore.submit();
  expect(restore.state()).toEqual({ kind: 'sent' });

  restore.clear();
  expect(restore.state()).toEqual({ kind: 'idle' });
});
