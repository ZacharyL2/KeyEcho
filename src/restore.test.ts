import { afterEach, expect, test, vi } from 'vitest';

import { requestRestoreEmail } from './restore';

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
