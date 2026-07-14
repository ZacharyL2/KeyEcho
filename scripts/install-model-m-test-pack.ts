import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACK_NAME = 'model-m-bucklespring-local-test';
const CLIP_DURATION_MS = 95;

const keyToScanCode: Record<string, string> = {
  Alt: '38',
  AltGr: '61',
  Backspace: '0e',
  CapsLock: '3a',
  ControlLeft: '1d',
  ControlRight: '67',
  Delete: '53',
  DownArrow: '50',
  End: '4f',
  Escape: '01',
  F1: '3b',
  F2: '3c',
  F3: '3d',
  F4: '3e',
  F5: '3f',
  F6: '40',
  F7: '41',
  F8: '42',
  F9: '43',
  F10: '44',
  F11: '57',
  F12: '58',
  Home: '47',
  LeftArrow: '4b',
  MetaLeft: '5b',
  MetaRight: '5b',
  PageDown: '51',
  PageUp: '49',
  Return: '1c',
  RightArrow: '4d',
  ShiftLeft: '2a',
  ShiftRight: '36',
  Space: '39',
  Tab: '0f',
  UpArrow: '48',
  PrintScreen: '6f',
  ScrollLock: '46',
  Pause: '77',
  NumLock: '45',
  BackQuote: '29',
  Num1: '02',
  Num2: '03',
  Num3: '04',
  Num4: '05',
  Num5: '06',
  Num6: '07',
  Num7: '08',
  Num8: '09',
  Num9: '0a',
  Num0: '0b',
  Minus: '0c',
  Equal: '0d',
  KeyQ: '10',
  KeyW: '11',
  KeyE: '12',
  KeyR: '13',
  KeyT: '14',
  KeyY: '15',
  KeyU: '16',
  KeyI: '17',
  KeyO: '18',
  KeyP: '19',
  LeftBracket: '1a',
  RightBracket: '1b',
  KeyA: '1e',
  KeyS: '1f',
  KeyD: '20',
  KeyF: '21',
  KeyG: '22',
  KeyH: '23',
  KeyJ: '24',
  KeyK: '25',
  KeyL: '26',
  SemiColon: '27',
  Quote: '28',
  BackSlash: '2b',
  IntlBackslash: '56',
  KeyZ: '2c',
  KeyX: '2d',
  KeyC: '2e',
  KeyV: '2f',
  KeyB: '30',
  KeyN: '31',
  KeyM: '32',
  Comma: '33',
  Dot: '34',
  Slash: '35',
  Insert: '52',
  KpReturn: '1c',
  KpMinus: '4a',
  KpPlus: '4e',
  KpMultiply: '37',
  KpDivide: '35',
  Kp0: '52',
  Kp1: '4f',
  Kp2: '50',
  Kp3: '51',
  Kp4: '4b',
  Kp5: '4c',
  Kp6: '4d',
  Kp7: '47',
  Kp8: '48',
  Kp9: '49',
  KpDelete: '53',
};

type Slice = [number, number];

interface SoundpackConfig {
  currentSound?: string;
  sounds?: Array<{ name: string; value: string }>;
  volume?: number;
}

function shellQuoteForConcat(path: string): string {
  return path.replaceAll("'", "'\\''");
}

function wavDurationSeconds(path: string): number {
  const output = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ],
    { encoding: 'utf8' },
  );
  return Number.parseFloat(output.trim());
}

function findVorbisFfmpeg(): string {
  const candidates = [
    '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
    '/usr/local/opt/ffmpeg-full/bin/ffmpeg',
    'ffmpeg',
  ];
  for (const candidate of candidates) {
    if (candidate.startsWith('/') && !existsSync(candidate)) continue;
    try {
      const encoders = execFileSync(candidate, ['-hide_banner', '-encoders'], {
        encoding: 'utf8',
      });
      if (encoders.includes('libvorbis')) return candidate;
    } catch {
      // Try the next installed FFmpeg binary.
    }
  }
  throw new Error('No FFmpeg binary with the libvorbis encoder was found.');
}

function main(): void {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoDir = resolve(scriptDir, '..');
  const audioDir = resolve(repoDir, '..', 'bucklespring-windows', 'audios');
  if (!existsSync(audioDir)) {
    throw new Error(`BuckleSpring audio directory not found: ${audioDir}`);
  }

  const appDataDir = join(
    homedir(),
    'Library',
    'Application Support',
    'xyz.waveapps.keyecho',
  );
  const packDir = join(appDataDir, 'sounds', PACK_NAME);
  const concatListPath = join(packDir, 'concat.txt');
  const soundPath = join(packDir, 'sound.ogg');
  mkdirSync(packDir, { recursive: true });

  const defines: Record<string, Slice> = {};
  const releases: Record<string, Slice> = {};
  const concatFiles: string[] = [];
  let cursorSeconds = 0;

  for (const [key, scanCode] of Object.entries(keyToScanCode)) {
    for (const [suffix, target] of [
      ['0', defines],
      ['1', releases],
    ] as const) {
      const wavPath = join(audioDir, `${scanCode}-${suffix}.wav`);
      if (!existsSync(wavPath)) continue;

      const durationSeconds = wavDurationSeconds(wavPath);
      target[key] = [
        Math.round(cursorSeconds * 1_000),
        Math.min(CLIP_DURATION_MS, Math.round(durationSeconds * 1_000)),
      ];
      concatFiles.push(`file '${shellQuoteForConcat(wavPath)}'`);
      cursorSeconds += durationSeconds;
    }
  }

  writeFileSync(concatListPath, `${concatFiles.join('\n')}\n`);
  try {
    const ffmpeg = findVorbisFfmpeg();
    execFileSync(
      ffmpeg,
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
        concatListPath,
        '-c:a',
        'libvorbis',
        '-q:a',
        '5',
        soundPath,
      ],
      { stdio: 'inherit' },
    );
  } finally {
    rmSync(concatListPath, { force: true });
  }

  writeFileSync(
    join(packDir, 'config.json'),
    `${JSON.stringify(
      {
        name: 'Model M BuckleSpring (local test)',
        key_define_type: 'press_release',
        sound: 'sound.ogg',
        defines,
        releases,
      },
      null,
      2,
    )}\n`,
  );

  const appConfigPath = join(appDataDir, 'soundpack.config.json');
  const backupPath = `${appConfigPath}.before-model-m-test.bak`;
  const appConfig: SoundpackConfig = existsSync(appConfigPath)
    ? JSON.parse(readFileSync(appConfigPath, 'utf8'))
    : {};
  if (existsSync(appConfigPath) && !existsSync(backupPath)) {
    copyFileSync(appConfigPath, backupPath);
  }

  const sounds = (appConfig.sounds ?? []).filter(
    (sound) => sound.name !== PACK_NAME,
  );
  sounds.push({ name: PACK_NAME, value: packDir });
  writeFileSync(
    appConfigPath,
    `${JSON.stringify(
      { ...appConfig, sounds, currentSound: packDir },
      null,
      2,
    )}\n`,
  );

  console.log(`Installed and selected local test pack: ${packDir}`);
  console.log(
    `Mapped ${Object.keys(defines).length} press and ${Object.keys(releases).length} release sounds.`,
  );
  console.log('Quit KeyEcho, then run `pnpm dev` to try it.');
}

main();
