import type { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { SoundSlice } from './press-release-split';
import { splitSoundSlice } from './press-release-split';

const SOURCE_PACKS = ['cherrymx-black-abs', 'cherrymx-brown-abs'] as const;
const FRAME_DURATION_MS = 1;

interface PackConfig {
  defines: Record<string, SoundSlice>;
  key_define_type?: string;
  name?: string;
  releases?: Record<string, SoundSlice>;
  sound?: string;
}

interface AppConfig {
  currentSound?: string;
  sounds?: Array<{ name: string; value: string }>;
  volume?: number;
}

function sampleRate(path: string): number {
  const output = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=sample_rate',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ],
    { encoding: 'utf8' },
  );
  return Number.parseInt(output.trim(), 10);
}

function decodeMonoFloat(path: string): Buffer {
  return execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      path,
      '-map',
      '0:a:0',
      '-ac',
      '1',
      '-f',
      'f32le',
      '-acodec',
      'pcm_f32le',
      'pipe:1',
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
}

function energyEnvelope(
  pcm: Buffer,
  rate: number,
  [startMs, durationMs]: SoundSlice,
): number[] {
  const frameSamples = Math.max(
    1,
    Math.round((rate * FRAME_DURATION_MS) / 1_000),
  );
  const startSample = Math.round((startMs * rate) / 1_000);
  const endSample = Math.min(
    Math.floor(pcm.length / Float32Array.BYTES_PER_ELEMENT),
    Math.round(((startMs + durationMs) * rate) / 1_000),
  );
  const envelope: number[] = [];

  for (
    let frameStart = startSample;
    frameStart < endSample;
    frameStart += frameSamples
  ) {
    const frameEnd = Math.min(endSample, frameStart + frameSamples);
    let peak = 0;
    for (let sample = frameStart; sample < frameEnd; sample += 1) {
      peak = Math.max(
        peak,
        Math.abs(pcm.readFloatLE(sample * Float32Array.BYTES_PER_ELEMENT)),
      );
    }
    envelope.push(peak);
  }

  return envelope;
}

function installDerivedPack(
  soundsDir: string,
  sourceName: string,
): { name: string; value: string; releaseCount: number } {
  const sourceDir = join(soundsDir, sourceName);
  const sourceAudio = join(sourceDir, 'sound.ogg');
  const sourceConfigPath = join(sourceDir, 'config.json');
  if (!existsSync(sourceAudio) || !existsSync(sourceConfigPath)) {
    throw new Error(`Source sound pack is incomplete: ${sourceDir}`);
  }

  const sourceConfig: PackConfig = JSON.parse(
    readFileSync(sourceConfigPath, 'utf8'),
  );
  const rate = sampleRate(sourceAudio);
  const pcm = decodeMonoFloat(sourceAudio);
  const defines: Record<string, SoundSlice> = {};
  const releases: Record<string, SoundSlice> = {};
  const splitCache = new Map<string, ReturnType<typeof splitSoundSlice>>();

  for (const [key, sourceSlice] of Object.entries(sourceConfig.defines)) {
    const cacheKey = sourceSlice.join(':');
    let split = splitCache.get(cacheKey);
    if (!splitCache.has(cacheKey)) {
      split = splitSoundSlice(
        sourceSlice,
        energyEnvelope(pcm, rate, sourceSlice),
        FRAME_DURATION_MS,
      );
      splitCache.set(cacheKey, split);
    }

    if (split) {
      defines[key] = split.press;
      releases[key] = split.release;
    } else {
      defines[key] = sourceSlice;
    }
  }

  const derivedName = `${sourceName}-press-release-test`;
  const derivedDir = join(soundsDir, derivedName);
  rmSync(derivedDir, { recursive: true, force: true });
  mkdirSync(derivedDir, { recursive: true });
  try {
    linkSync(sourceAudio, join(derivedDir, 'sound.ogg'));
  } catch {
    copyFileSync(sourceAudio, join(derivedDir, 'sound.ogg'));
  }
  writeFileSync(
    join(derivedDir, 'config.json'),
    `${JSON.stringify(
      {
        ...sourceConfig,
        name: `${sourceConfig.name ?? sourceName} (Press + Release Test)`,
        key_define_type: 'press_release',
        sound: 'sound.ogg',
        defines,
        releases,
      },
      null,
      2,
    )}\n`,
  );

  return {
    name: derivedName,
    value: derivedDir,
    releaseCount: Object.keys(releases).length,
  };
}

function main(): void {
  const appDataDir = join(
    homedir(),
    'Library',
    'Application Support',
    'xyz.waveapps.keyecho',
  );
  const soundsDir = join(appDataDir, 'sounds');
  const installed = SOURCE_PACKS.map((sourceName) =>
    installDerivedPack(soundsDir, sourceName),
  );

  const appConfigPath = join(appDataDir, 'soundpack.config.json');
  const backupPath = `${appConfigPath}.before-derived-press-release.bak`;
  const appConfig: AppConfig = existsSync(appConfigPath)
    ? JSON.parse(readFileSync(appConfigPath, 'utf8'))
    : {};
  if (existsSync(appConfigPath) && !existsSync(backupPath)) {
    copyFileSync(appConfigPath, backupPath);
  }

  const installedNames = new Set(installed.map((pack) => pack.name));
  const sounds = (appConfig.sounds ?? []).filter(
    (sound) => !installedNames.has(sound.name),
  );
  sounds.push(...installed.map(({ name, value }) => ({ name, value })));
  writeFileSync(
    appConfigPath,
    `${JSON.stringify(
      {
        ...appConfig,
        sounds,
        currentSound: installed[0].value,
      },
      null,
      2,
    )}\n`,
  );

  for (const pack of installed) {
    console.log(`Installed ${pack.name}: ${pack.releaseCount} release sounds`);
  }
  console.log(`Selected ${installed[0].name}`);
}

main();
