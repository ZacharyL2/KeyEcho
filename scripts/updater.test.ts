import { describe, expect, it } from 'vitest';

import {
  createUpdateManifest,
  getPublishPlatforms,
  resolvePlatforms,
} from './updater';

describe('updater asset mapping', () => {
  it('keeps the updater manifest compatible with Tauri v1 and v2', () => {
    expect(
      createUpdateManifest('v1.0.0', 'Release notes', '2026-07-09T00:00:00Z'),
    ).toMatchObject({
      notes: 'Release notes',
      pub_date: '2026-07-09T00:00:00Z',
      version: 'v1.0.0',
    });
    expect(
      createUpdateManifest('v1.0.0', 'Release notes'),
    ).not.toHaveProperty('name');
  });

  it('maps Windows updater artifacts', () => {
    expect(resolvePlatforms('KeyEcho_0.0.5_x64-setup.nsis.zip')).toEqual([
      'win64',
      'windows-x86_64-nsis',
      'windows-x86_64',
    ]);
    expect(resolvePlatforms('KeyEcho_0.0.5_arm64-setup.nsis.zip')).toEqual([
      'windows-aarch64-nsis',
      'windows-aarch64',
    ]);
  });

  it('maps macOS updater artifacts', () => {
    expect(resolvePlatforms('KeyEcho_x64.app.tar.gz')).toEqual([
      'darwin',
      'darwin-intel',
      'darwin-x86_64-app',
      'darwin-x86_64',
    ]);
    expect(resolvePlatforms('KeyEcho_aarch64.app.tar.gz')).toEqual([
      'darwin-aarch64-app',
      'darwin-aarch64',
    ]);
    expect(resolvePlatforms('KeyEcho_0.0.5_x64.app.tar.gz')).toEqual([
      'darwin',
      'darwin-intel',
      'darwin-x86_64-app',
      'darwin-x86_64',
    ]);
    expect(resolvePlatforms('KeyEcho_0.0.5_aarch64.app.tar.gz')).toEqual([
      'darwin-aarch64-app',
      'darwin-aarch64',
    ]);
  });

  it('does not guess ambiguous macOS updater artifacts', () => {
    expect(resolvePlatforms('KeyEcho.app.tar.gz')).toEqual([]);
  });

  it('does not map Linux x64 artifacts to arm platforms', () => {
    expect(resolvePlatforms('KeyEcho_0.0.5_amd64.AppImage.tar.gz')).toEqual([
      'linux',
      'linux-x86_64-appimage',
      'linux-x86_64',
    ]);
    expect(resolvePlatforms('KeyEcho_0.0.5_aarch64.AppImage.tar.gz')).toEqual([
      'linux-aarch64-appimage',
      'linux-aarch64',
    ]);
    expect(resolvePlatforms('KeyEcho_0.0.5_armv7.AppImage.tar.gz')).toEqual([
      'linux-armv7-appimage',
      'linux-armv7',
    ]);
  });

  it('drops empty platforms and rejects missing signatures', () => {
    expect(
      getPublishPlatforms({
        linux: { signature: 'sig', url: 'https://example.com/linux' },
        'linux-aarch64': { signature: '', url: '' },
      }),
    ).toEqual({
      linux: { signature: 'sig', url: 'https://example.com/linux' },
    });

    expect(() =>
      getPublishPlatforms({
        linux: { signature: '', url: 'https://example.com/linux' },
      }),
    ).toThrow('Missing updater signatures for: linux');
  });
});
