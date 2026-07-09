import { invoke } from '@tauri-apps/api/core';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { commands } from './bindings';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const invokeMock = invoke as unknown as Mock;

describe('commands', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('wraps successful commands', async () => {
    const sounds = [{ name: 'black', value: '/sounds/black' }];
    invokeMock.mockResolvedValueOnce(sounds);

    await expect(commands.getSounds()).resolves.toEqual({
      status: 'ok',
      data: sounds,
    });
    expect(invokeMock).toHaveBeenCalledWith('get_sounds', undefined);
  });

  it('passes command arguments through to Tauri', async () => {
    invokeMock.mockResolvedValueOnce(null);

    await expect(
      commands.downloadSound('https://example.com/sound.tar'),
    ).resolves.toEqual({
      status: 'ok',
      data: null,
    });

    expect(invokeMock).toHaveBeenCalledWith('download_sound', {
      url: 'https://example.com/sound.tar',
    });
  });

  it('passes external link open requests through to Tauri', async () => {
    invokeMock.mockResolvedValueOnce(null);

    await expect(
      commands.openExternalUrl(
        'https://keyecho.app/?source=keyecho_app&intent=founding_bundle',
      ),
    ).resolves.toEqual({
      status: 'ok',
      data: null,
    });

    expect(invokeMock).toHaveBeenCalledWith('open_external_url', {
      url: 'https://keyecho.app/?source=keyecho_app&intent=founding_bundle',
    });
  });

  it('returns error messages from Error rejections', async () => {
    invokeMock.mockRejectedValueOnce(new Error('device unavailable'));

    await expect(commands.getVolume()).resolves.toEqual({
      status: 'error',
      error: 'device unavailable',
    });
  });

  it('stringifies non-Error rejections', async () => {
    invokeMock.mockRejectedValueOnce('offline');

    await expect(commands.selectSound('/sounds/black')).resolves.toEqual({
      status: 'error',
      error: 'offline',
    });
  });
});
