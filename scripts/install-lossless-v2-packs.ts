import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { keyToScanCode } from './install-model-m-test-pack';

const WAV_COMMIT = 'e1d654baf2058eb20b8171ebba281e97a9291a00';
const HISTORICAL_PACKS = [
  ['cherrymx-black-pbt', 'black-pbt'],
  ['cherrymx-blue-abs', 'blue-abs'],
  ['cherrymx-brown-abs', 'brown-abs'],
  ['cherrymx-brown-pbt', 'brown-pbt'],
  ['cherrymx-red-abs', 'red-abs'],
] as const;

type MillisecondSlice = [number, number];
interface FrameSlice {
  startFrame: number;
  frameCount: number;
}
type FrameDefines = Record<string, FrameSlice[]>;

interface LegacyConfig {
  defines: Record<string, MillisecondSlice>;
  releases?: Record<string, MillisecondSlice>;
}

interface AudioInfo {
  sampleRate: number;
  channels: number;
  frameCount: number;
}

interface AppConfig {
  currentSound?: string;
  sounds?: Array<{ name: string; value: string }>;
  volume?: number;
}

interface WavEvent {
  file: string;
  key: string;
  release?: boolean;
  maxDurationMs?: number;
}

function audioInfo(path: string): AudioInfo {
  const output = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=sample_rate,channels,duration_ts',
      '-of',
      'json',
      path,
    ],
    { encoding: 'utf8' },
  );
  const stream = JSON.parse(output).streams?.[0];
  const info = {
    sampleRate: Number(stream?.sample_rate),
    channels: Number(stream?.channels),
    frameCount: Number(stream?.duration_ts),
  };
  if (!info.sampleRate || !info.channels || !info.frameCount) {
    throw new Error(`Invalid audio metadata: ${path}`);
  }
  return info;
}

function writeV2Config(
  packDir: string,
  audio: AudioInfo,
  defines: FrameDefines,
  releases: FrameDefines = {},
): void {
  for (const entries of [defines, releases]) {
    for (const [key, slices] of Object.entries(entries)) {
      if (
        slices.length === 0 ||
        slices.some(
          ({ startFrame, frameCount }) =>
            startFrame < 0 ||
            frameCount <= 0 ||
            startFrame + frameCount > audio.frameCount,
        )
      ) {
        throw new Error(`Invalid frame range for ${key} in ${packDir}`);
      }
    }
  }
  writeFileSync(
    join(packDir, 'config.json'),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        audio: {
          file: 'sound.flac',
          sampleRate: audio.sampleRate,
          channels: audio.channels,
          frameCount: audio.frameCount,
        },
        defines,
        releases,
      },
      null,
      2,
    )}\n`,
  );
}

function encodeFlac(input: string, output: string): AudioInfo {
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input,
      '-map',
      '0:a:0',
      '-c:a',
      'flac',
      '-compression_level',
      '8',
      output,
    ],
    { stdio: 'inherit' },
  );
  return audioInfo(output);
}

function legacyDefines(
  values: Record<string, MillisecondSlice> | undefined,
  sampleRate: number,
): FrameDefines {
  return Object.fromEntries(
    Object.entries(values ?? {}).map(([key, [startMs, durationMs]]) => [
      key,
      [
        {
          startFrame: Math.round((startMs * sampleRate) / 1_000),
          frameCount: Math.max(
            1,
            Math.round((durationMs * sampleRate) / 1_000),
          ),
        },
      ],
    ]),
  );
}

function buildHistoricalPack(
  repoDir: string,
  mechvibesDir: string,
  buildDir: string,
  id: string,
  oldId: string,
): string {
  const packName = `${id}-v2-lossless`;
  const packDir = join(buildDir, packName);
  const wavPath = join(buildDir, `${oldId}.wav`);
  mkdirSync(packDir);
  writeFileSync(
    wavPath,
    execFileSync(
      'git',
      [
        '-C',
        mechvibesDir,
        'show',
        `${WAV_COMMIT}:src/audio/${oldId}/sound.wav`,
      ],
      { maxBuffer: 32 * 1024 * 1024 },
    ),
  );
  const source = audioInfo(wavPath);
  const output = encodeFlac(wavPath, join(packDir, 'sound.flac'));
  if (
    source.sampleRate !== output.sampleRate ||
    source.channels !== output.channels ||
    source.frameCount !== output.frameCount
  ) {
    throw new Error(`FLAC metadata changed while converting ${id}`);
  }
  const config: LegacyConfig = JSON.parse(
    execFileSync(
      'tar',
      [
        '-xOf',
        join(repoDir, 'src-tauri', 'resources', `${id}.tar`),
        `${id}/config.json`,
      ],
      { encoding: 'utf8' },
    ),
  );
  writeV2Config(
    packDir,
    output,
    legacyDefines(config.defines, output.sampleRate),
    legacyDefines(config.releases, output.sampleRate),
  );
  return packName;
}

function concatQuote(path: string): string {
  return path.replaceAll("'", "'\\''");
}

function buildWavPack(
  buildDir: string,
  packName: string,
  events: WavEvent[],
): string {
  const packDir = join(buildDir, packName);
  const listPath = join(buildDir, `${packName}.txt`);
  const defines: FrameDefines = {};
  const releases: FrameDefines = {};
  const files = new Map<string, { info: AudioInfo; startFrame: number }>();
  let format: Pick<AudioInfo, 'sampleRate' | 'channels'> | undefined;
  let cursor = 0;

  for (const event of events) {
    let source = files.get(event.file);
    if (!source) {
      const info = audioInfo(event.file);
      format ??= info;
      if (
        format.sampleRate !== info.sampleRate ||
        format.channels !== info.channels
      ) {
        throw new Error(`Mixed WAV formats are not supported: ${event.file}`);
      }
      source = { info, startFrame: cursor };
      files.set(event.file, source);
      cursor += info.frameCount;
    }
    const target = event.release ? releases : defines;
    const frameCount = event.maxDurationMs
      ? Math.min(
          source.info.frameCount,
          Math.round((event.maxDurationMs * source.info.sampleRate) / 1_000),
        )
      : source.info.frameCount;
    (target[event.key] ??= []).push({
      startFrame: source.startFrame,
      frameCount,
    });
  }

  mkdirSync(packDir);
  writeFileSync(
    listPath,
    `${[...files.keys()]
      .map((path) => `file '${concatQuote(path)}'`)
      .join('\n')}\n`,
  );
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c:a',
      'flac',
      '-compression_level',
      '8',
      join(packDir, 'sound.flac'),
    ],
    { stdio: 'inherit' },
  );
  const output = audioInfo(join(packDir, 'sound.flac'));
  if (
    !format ||
    output.sampleRate !== format.sampleRate ||
    output.channels !== format.channels ||
    output.frameCount !== cursor
  ) {
    throw new Error(`FLAC metadata changed while building ${packName}`);
  }
  writeV2Config(packDir, output, defines, releases);
  return packName;
}

function evdevKeyMap(): Map<string, string> {
  const map = new Map(
    Object.entries(keyToScanCode).map(([key, code]) => [
      String(Number.parseInt(code, 16)),
      key,
    ]),
  );
  for (const [code, key] of Object.entries({
    28: 'Return',
    53: 'Slash',
    87: 'F11',
    88: 'F12',
    96: 'KpReturn',
    97: 'ControlRight',
    98: 'KpDivide',
    100: 'AltGr',
    102: 'Home',
    103: 'UpArrow',
    104: 'PageUp',
    105: 'LeftArrow',
    106: 'RightArrow',
    107: 'End',
    108: 'DownArrow',
    109: 'PageDown',
    110: 'Insert',
    111: 'Delete',
    125: 'MetaLeft',
    126: 'MetaRight',
  })) {
    map.set(code, key);
  }
  return map;
}

function nkCreamEvents(mechvibesDir: string): WavEvent[] {
  const sourceDir = join(mechvibesDir, 'src', 'audio', 'nk-cream');
  const config: { defines: Record<string, string | null> } = JSON.parse(
    readFileSync(join(sourceDir, 'config.json'), 'utf8'),
  );
  const keyMap = evdevKeyMap();
  return Object.entries(config.defines).flatMap(([code, file]) => {
    if (!file || Number(code) > 255) return [];
    const key = keyMap.get(code);
    if (!key) throw new Error(`Unknown NK Cream key code: ${code}`);
    return [{ key, file: join(sourceDir, file) }];
  });
}

function modelMEvents(repoDir: string): WavEvent[] {
  const sourceDir = resolve(repoDir, '..', 'bucklespring-windows', 'audios');
  return Object.entries(keyToScanCode).flatMap(([key, scanCode]) =>
    [
      ['0', false],
      ['1', true],
    ].flatMap(([suffix, release]) => {
      const file = join(sourceDir, `${scanCode}-${suffix}.wav`);
      return existsSync(file)
        ? [{ key, file, release: Boolean(release), maxDurationMs: 95 }]
        : [];
    }),
  );
}

function clonePack(
  buildDir: string,
  sourceName: string,
  targetName: string,
): string {
  const sourceDir = join(buildDir, sourceName);
  const targetDir = join(buildDir, targetName);
  mkdirSync(targetDir);
  copyFileSync(join(sourceDir, 'config.json'), join(targetDir, 'config.json'));
  try {
    linkSync(join(sourceDir, 'sound.flac'), join(targetDir, 'sound.flac'));
  } catch {
    copyFileSync(join(sourceDir, 'sound.flac'), join(targetDir, 'sound.flac'));
  }
  return targetName;
}

function installPacks(
  appDataDir: string,
  buildDir: string,
  names: string[],
): void {
  const soundsDir = join(appDataDir, 'sounds');
  mkdirSync(soundsDir, { recursive: true });
  for (const name of names) {
    const destination = join(soundsDir, name);
    rmSync(destination, { recursive: true, force: true });
    renameSync(join(buildDir, name), destination);
  }

  const configPath = join(appDataDir, 'soundpack.config.json');
  const config: AppConfig = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, 'utf8'))
    : {};
  const installed = new Set(names);
  const sounds = (config.sounds ?? []).filter(
    ({ name }) => !installed.has(name),
  );
  sounds.push(...names.map((name) => ({ name, value: join(soundsDir, name) })));
  const temporary = `${configPath}.tmp`;
  writeFileSync(
    temporary,
    `${JSON.stringify({ ...config, sounds }, null, 2)}\n`,
  );
  renameSync(temporary, configPath);
}

function main(): void {
  const repoDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const mechvibesDir = resolve(
    process.argv.slice(2).find((argument) => argument !== '--') ??
      '/tmp/keyecho-mechvibes-audit',
  );
  if (!existsSync(join(mechvibesDir, '.git'))) {
    throw new Error(
      `Pass a full Mechvibes checkout as the first argument: ${mechvibesDir}`,
    );
  }
  const buildDir = mkdtempSync(join(tmpdir(), 'keyecho-lossless-v2-'));
  try {
    const names = HISTORICAL_PACKS.map(([id, oldId]) =>
      buildHistoricalPack(repoDir, mechvibesDir, buildDir, id, oldId),
    );
    const nkCream = buildWavPack(
      buildDir,
      'nk-cream-v2-lossless',
      nkCreamEvents(mechvibesDir),
    );
    names.push(nkCream);
    names.push(
      clonePack(buildDir, nkCream, 'creamy-thock-private-test-v2-lossless'),
    );
    names.push(
      buildWavPack(
        buildDir,
        'model-m-bucklespring-v2-lossless',
        modelMEvents(repoDir),
      ),
    );
    const appDataDir = join(
      homedir(),
      'Library',
      'Application Support',
      'xyz.waveapps.keyecho',
    );
    installPacks(appDataDir, buildDir, names);
    console.log(`Installed ${names.length} lossless v2 packs:`);
    for (const name of names) console.log(`- ${name}`);
  } finally {
    rmSync(buildDir, { recursive: true, force: true });
  }
}

main();
