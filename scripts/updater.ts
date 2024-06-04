import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { context, getOctokit } from '@actions/github';

const UPDATE_LOG = 'UPDATELOG.md';

const UPDATE_TAG_NAME = 'updater';
const UPDATE_JSON_FILE = 'update.json';

function resolveUpdateLog(tag: string) {
  const cwd = process.cwd();
  const filePath = path.join(cwd, UPDATE_LOG);

  if (!fs.existsSync(filePath)) {
    throw new Error('Could not find UPDATELOG.md');
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
    throw new Error(`Could not find "${tag}" in UPDATELOG.md`);
  }

  return map[tag].join('\n').trim();
}

async function getSignature(url: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/octet-stream' },
  });

  return response.text();
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

  const { data: tags } = await github.rest.repos.listTags({
    ...options,
    per_page: 10,
    page: 1,
  });

  const tag = tags.find((t) => t.name.startsWith('v'));

  if (!tag) {
    throw new Error('not found latest publish tag');
  }

  // eslint-disable-next-line no-console
  console.log('tag: ', tag);

  const { data: latestRelease } = await github.rest.repos.getReleaseByTag({
    ...options,
    tag: tag.name,
  });

  const updateData = {
    name: tag.name,
    notes: resolveUpdateLog(tag.name),
    pub_date: new Date().toISOString(),
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

  const promises = latestRelease.assets.map(async (asset) => {
    const { name, browser_download_url } = asset;

    // win64 url
    if (name.endsWith('x64-setup.nsis.zip')) {
      updateData.platforms.win64.url = browser_download_url;
      updateData.platforms['windows-x86_64'].url = browser_download_url;
    }
    // win64 signature
    if (name.endsWith('x64-setup.nsis.zip.sig')) {
      const sig = await getSignature(browser_download_url);
      updateData.platforms.win64.signature = sig;
      updateData.platforms['windows-x86_64'].signature = sig;
    }
    // win arm url
    if (name.endsWith('arm64-setup.nsis.zip')) {
      updateData.platforms['windows-aarch64'].url = browser_download_url;
    }
    // win arm signature
    if (name.endsWith('arm64-setup.nsis.zip.sig')) {
      const sig = await getSignature(browser_download_url);
      updateData.platforms['windows-aarch64'].signature = sig;
    }

    // darwin url (intel)
    if (name.endsWith('.app.tar.gz') && !name.includes('aarch')) {
      updateData.platforms.darwin.url = browser_download_url;
      updateData.platforms['darwin-intel'].url = browser_download_url;
      updateData.platforms['darwin-x86_64'].url = browser_download_url;
    }
    // darwin signature (intel)
    if (name.endsWith('.app.tar.gz.sig') && !name.includes('aarch')) {
      const sig = await getSignature(browser_download_url);
      updateData.platforms.darwin.signature = sig;
      updateData.platforms['darwin-intel'].signature = sig;
      updateData.platforms['darwin-x86_64'].signature = sig;
    }

    // darwin url (aarch)
    if (name.endsWith('aarch64.app.tar.gz')) {
      updateData.platforms['darwin-aarch64'].url = browser_download_url;
    }
    // darwin signature (aarch)
    if (name.endsWith('aarch64.app.tar.gz.sig')) {
      const sig = await getSignature(browser_download_url);
      updateData.platforms['darwin-aarch64'].signature = sig;
    }

    // linux x64 url
    if (name.endsWith('amd64.AppImage.tar.gz')) {
      updateData.platforms.linux.url = browser_download_url;
      updateData.platforms['linux-x86_64'].url = browser_download_url;
      updateData.platforms['linux-aarch64'].url = browser_download_url;
      updateData.platforms['linux-armv7'].url = browser_download_url;
    }
    // linux x64 signature
    if (name.endsWith('amd64.AppImage.tar.gz.sig')) {
      const sig = await getSignature(browser_download_url);
      updateData.platforms.linux.signature = sig;
      updateData.platforms['linux-x86_64'].signature = sig;
      updateData.platforms['linux-aarch64'].signature = sig;
      updateData.platforms['linux-armv7'].signature = sig;
    }
  });

  await Promise.allSettled(promises);

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
        platforms: Object.fromEntries(
          Object.entries(updateData.platforms).filter(([_k, v]) =>
            Boolean(v.url),
          ),
        ),
      },
      null,
      2,
    ),
  });
}

resolveUpdater();
