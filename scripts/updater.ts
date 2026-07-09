import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { context, getOctokit } from '@actions/github';

const CHANGELOG = 'CHANGELOG.md';

const UPDATE_TAG_NAME = 'updater';
const UPDATE_JSON_FILE = 'update.json';
const RELEASE_TAG_RE = /^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;
const MACOS_AARCH64_RE = /(?:^|[_.-])(?:aarch64|arm64)(?:[_.-]|$)/i;
const MACOS_X64_RE = /(?:^|[_.-])(?:x64|x86_64)(?:[_.-]|$)/i;

export interface UpdatePlatform {
  signature: string;
  url: string;
}

export type UpdatePlatforms = Record<string, UpdatePlatform>;

export interface UpdateManifest {
  name: string;
  notes: string;
  platforms: UpdatePlatforms;
  pub_date: string;
  version: string;
}

export function createUpdateManifest(
  tag: string,
  notes: string,
  pubDate = new Date().toISOString(),
): UpdateManifest {
  return {
    name: tag,
    version: tag,
    notes,
    pub_date: pubDate,
    platforms: {
      win64: { signature: '', url: '' }, // compatible with older formats
      linux: { signature: '', url: '' }, // compatible with older formats
      darwin: { signature: '', url: '' }, // compatible with older formats
      'windows-x86_64': { signature: '', url: '' },
      'windows-aarch64': { signature: '', url: '' },

      'darwin-x86_64': { signature: '', url: '' },
      'darwin-intel': { signature: '', url: '' },
      'darwin-aarch64': { signature: '', url: '' },

      'linux-x86_64': { signature: '', url: '' },
      'linux-aarch64': { signature: '', url: '' },
      'linux-armv7': { signature: '', url: '' },
    },
  };
}

function resolveUpdateLog(tag: string) {
  const cwd = process.cwd();
  const filePath = path.join(cwd, CHANGELOG);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Could not find ${CHANGELOG}`);
  }

  const data = fs.readFileSync(filePath, 'utf-8');
  const lines = data.split('\n');

  const reTitle = /^## v[\d.]+/;
  const reEnd = /^---/;

  const { map } = lines.reduce(
    (acc, line) => {
      if (reTitle.test(line)) {
        const version = line.slice(3).trim();
        if (acc.map[version]) {
          throw new Error(`Tag ${version} duplicate`);
        }
        acc.current = version;
        acc.map[version] = [];
      } else if (reEnd.test(line)) {
        acc.current = '';
      } else if (acc.current) {
        acc.map[acc.current].push(line);
      }
      return acc;
    },
    { map: {} as Record<string, string[]>, current: '' },
  );

  if (!map[tag]) {
    throw new Error(`Could not find "${tag}" in ${CHANGELOG}`);
  }

  return map[tag].join('\n').trim();
}

async function getSignature(url: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/octet-stream' },
  });

  if (!response.ok) {
    throw new Error(`Signature download failed: ${url} (${response.status})`);
  }

  return (await response.text()).trim();
}

export function resolvePlatforms(assetName: string): string[] {
  if (assetName.endsWith('x64-setup.nsis.zip')) {
    return ['win64', 'windows-x86_64'];
  }

  if (assetName.endsWith('arm64-setup.nsis.zip')) {
    return ['windows-aarch64'];
  }

  if (assetName.endsWith('.app.tar.gz')) {
    if (MACOS_AARCH64_RE.test(assetName)) {
      return ['darwin-aarch64'];
    }

    if (MACOS_X64_RE.test(assetName)) {
      return ['darwin', 'darwin-intel', 'darwin-x86_64'];
    }

    return [];
  }

  if (assetName.endsWith('.AppImage.tar.gz')) {
    if (/amd64|x86_64/i.test(assetName)) {
      return ['linux', 'linux-x86_64'];
    }

    if (/aarch64|arm64/i.test(assetName)) {
      return ['linux-aarch64'];
    }

    if (/arm(?:v7l?|hf)/i.test(assetName)) {
      return ['linux-armv7'];
    }
  }

  return [];
}

function isAmbiguousMacosUpdaterArtifact(assetName: string): boolean {
  return (
    assetName.endsWith('.app.tar.gz') && !resolvePlatforms(assetName).length
  );
}

export function getPublishPlatforms(
  platforms: UpdatePlatforms,
): UpdatePlatforms {
  const publishPlatforms = Object.fromEntries(
    Object.entries(platforms).filter(([, value]) => Boolean(value.url)),
  );

  const missingSignatures = Object.entries(publishPlatforms)
    .filter(([, value]) => !value.signature)
    .map(([key]) => key);

  if (missingSignatures.length) {
    throw new Error(
      `Missing updater signatures for: ${missingSignatures.join(', ')}`,
    );
  }

  return publishPlatforms;
}

async function resolveUpdater() {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is required');
  }

  const options = {
    owner: context.repo.owner,
    repo: context.repo.repo,
  };

  const github = getOctokit(process.env.GITHUB_TOKEN);

  const releases = await github.paginate(github.rest.repos.listReleases, {
    ...options,
    per_page: 100,
  });

  const latestRelease = releases.find(
    (release) =>
      !release.draft &&
      !release.prerelease &&
      release.tag_name !== UPDATE_TAG_NAME &&
      RELEASE_TAG_RE.test(release.tag_name),
  );

  if (!latestRelease) {
    throw new Error('not found latest publish tag');
  }

  console.log('release tag: ', latestRelease.tag_name);

  const updateData = createUpdateManifest(
    latestRelease.tag_name,
    resolveUpdateLog(latestRelease.tag_name),
  );

  const promises = latestRelease.assets.map(async (asset) => {
    const { name, browser_download_url } = asset;
    const isSignature = name.endsWith('.sig');
    const assetName = isSignature ? name.slice(0, -4) : name;
    const platforms = resolvePlatforms(assetName);

    if (!platforms.length) {
      if (isAmbiguousMacosUpdaterArtifact(assetName)) {
        throw new Error(
          `Could not resolve macOS updater platform from asset name: ${assetName}`,
        );
      }

      return;
    }

    if (isSignature) {
      const sig = await getSignature(browser_download_url);
      for (const platform of platforms) {
        updateData.platforms[platform].signature = sig;
      }
    } else {
      for (const platform of platforms) {
        updateData.platforms[platform].url = browser_download_url;
      }
    }
  });

  await Promise.all(promises);
  const platforms = getPublishPlatforms(updateData.platforms);

  // update the update.json
  const { data: updateRelease } = await github.rest.repos.getReleaseByTag({
    ...options,
    tag: UPDATE_TAG_NAME,
  });

  const previousUpdaterJson = updateRelease.assets.find(
    (a) => a.name === UPDATE_JSON_FILE,
  );
  if (previousUpdaterJson) {
    await github.rest.repos.deleteReleaseAsset({
      ...options,
      asset_id: previousUpdaterJson.id,
    });
  }

  // upload new assets
  await github.rest.repos.uploadReleaseAsset({
    ...options,
    release_id: updateRelease.id,
    name: UPDATE_JSON_FILE,
    data: JSON.stringify(
      {
        ...updateData,
        platforms,
      },
      null,
      2,
    ),
  });
}

function isEntrypoint(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  const currentPath = fileURLToPath(import.meta.url);
  const invokedPath = path.resolve(process.argv[1]);
  return invokedPath === currentPath || `${invokedPath}.ts` === currentPath;
}

if (isEntrypoint()) {
  resolveUpdater().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
