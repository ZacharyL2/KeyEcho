import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_CHANGELOG = 'CHANGELOG.md';
const DEFAULT_CARGO_TOML = path.join('src-tauri', 'Cargo.toml');
const RELEASE_TAG_RE = /^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;

interface CliOptions {
  changelog?: string;
  help?: boolean;
  out?: string;
  tag?: string;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === '--') {
      continue;
    } else if (arg === '--tag') {
      options.tag = nextValue();
    } else if (arg.startsWith('--tag=')) {
      options.tag = arg.slice('--tag='.length);
    } else if (arg === '--out') {
      options.out = nextValue();
    } else if (arg.startsWith('--out=')) {
      options.out = arg.slice('--out='.length);
    } else if (arg === '--changelog') {
      options.changelog = nextValue();
    } else if (arg.startsWith('--changelog=')) {
      options.changelog = arg.slice('--changelog='.length);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readVersionFromCargoToml(cargoTomlPath = DEFAULT_CARGO_TOML): string {
  const data = fs.readFileSync(cargoTomlPath, 'utf8');
  const match = data.match(/^version = "([^"]+)"/m);

  if (!match?.[1]) {
    throw new Error(`Could not find version in ${cargoTomlPath}`);
  }

  return `v${match[1]}`;
}

export function resolveReleaseNotes(
  tag: string,
  changelogPath = DEFAULT_CHANGELOG,
): string {
  if (!RELEASE_TAG_RE.test(tag)) {
    throw new Error(`Invalid release tag: ${tag}`);
  }

  const data = fs.readFileSync(changelogPath, 'utf8');
  const lines = data.split(/\r?\n/);
  const releases = new Map<string, string[]>();
  let currentTag = '';

  for (const line of lines) {
    const heading = line.match(/^##\s+(v\d+\.\d+\.\d+(?:[-+][\w.-]+)?)\s*$/);

    if (heading?.[1]) {
      currentTag = heading[1];
      if (releases.has(currentTag)) {
        throw new Error(`Duplicate changelog section: ${currentTag}`);
      }
      releases.set(currentTag, []);
      continue;
    }

    if (/^---\s*$/.test(line)) {
      currentTag = '';
      continue;
    }

    if (currentTag) {
      releases.get(currentTag)?.push(line);
    }
  }

  if (!releases.has(tag)) {
    throw new Error(`Could not find ${tag} in ${changelogPath}`);
  }

  const notes = releases.get(tag)?.join('\n').trim();

  if (!notes) {
    throw new Error(`Changelog section is empty: ${tag}`);
  }

  return notes;
}

function printHelp(): void {
  console.log(`Usage: pnpm release-notes -- --tag v1.0.0 --out release-notes.md

Options:
  --tag        Release tag to extract. Defaults to src-tauri/Cargo.toml version.
  --out        Output file. Defaults to stdout.
  --changelog  Changelog file. Defaults to CHANGELOG.md.`);
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const tag = options.tag ?? readVersionFromCargoToml();
  const notes = `${resolveReleaseNotes(tag, options.changelog)}\n`;

  if (options.out) {
    fs.writeFileSync(options.out, notes, 'utf8');
    console.log(`Wrote ${options.out} from ${tag}`);
  } else {
    process.stdout.write(notes);
  }
}

function isEntrypoint(): boolean {
  return process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;
}

if (isEntrypoint()) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
