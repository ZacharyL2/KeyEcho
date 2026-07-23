// Audition a pack before installing it: plays slices of the public CDN preview
// clip with Web Audio, so paid packs (never downloaded) can be heard too.
// FLAC, not Ogg — WKWebView/Safari cannot decodeAudioData() an Ogg Vorbis buffer.

const PREVIEW_BASE = 'https://cdn.keyecho.app/previews';
const BURST_KEYS = 4;

// Audition pacing. The job here is judging timbre, not simulating typing: under
// ~200ms apart the ear groups the strokes into one rattle instead of hearing
// each as its own sound. Jitter keeps it from sounding mechanical.
const GAP_MIN_S = 0.19; // 190–330ms press → next press (~46 WPM, unhurried)
const GAP_JITTER_S = 0.14;
const HOLD_MIN_S = 0.07; // 70–110ms press → release, close to real key travel
const HOLD_JITTER_S = 0.04;

type Slice = [number, number]; // [startMs, durationMs] into the preview clip
interface KeySlices {
  press: Slice;
  release?: Slice;
}
interface Loaded {
  buffer: AudioBuffer;
  keys: KeySlices[];
}

let ctx: AudioContext | undefined;
const cache = new Map<string, Promise<Loaded>>();

function audioContext(): AudioContext | undefined {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    ctx = Ctor ? new Ctor() : undefined;
  }
  return ctx;
}

// defines maps a key to [pStart, pDur] or [pStart, pDur, rStart, rDur], in ms.
function parseKeys(defines: unknown): KeySlices[] {
  if (typeof defines !== 'object' || defines === null) {
    return [];
  }
  return Object.values(defines as Record<string, unknown>).flatMap((value) => {
    if (!Array.isArray(value)) {
      return [];
    }
    const nums = value.filter((n): n is number => typeof n === 'number');
    const [pStart, pDur, rStart, rDur] = nums;
    if (pStart === undefined || pDur === undefined || pDur <= 0) {
      return [];
    }
    const key: KeySlices = { press: [pStart, pDur] };
    if (rStart !== undefined && rDur !== undefined && rDur > 0) {
      key.release = [rStart, rDur];
    }
    return [key];
  });
}

async function load(id: string): Promise<Loaded> {
  const audio = audioContext();
  if (!audio) {
    throw new Error('audio unsupported');
  }
  const base = `${PREVIEW_BASE}/${encodeURIComponent(id)}`;

  let configRes: Response;
  let clipRes: Response;
  try {
    [configRes, clipRes] = await Promise.all([
      fetch(`${base}/config.json`),
      fetch(`${base}/sound.flac`),
    ]);
  } catch (err) {
    throw new Error(
      `fetch blocked: ${err instanceof Error ? err.message : err}`,
    );
  }
  if (!configRes.ok || !clipRes.ok) {
    throw new Error(`http ${configRes.status}/${clipRes.status}`);
  }

  const config = (await configRes.json()) as { defines?: unknown };
  const bytes = await clipRes.arrayBuffer();

  let buffer: AudioBuffer;
  try {
    buffer = await audio.decodeAudioData(bytes);
  } catch (err) {
    // WebKit is picky about codecs here; name it so the cause isn't guesswork.
    throw new Error(
      `decode failed (${bytes.byteLength}B flac): ${err instanceof Error ? err.message : err}`,
    );
  }

  const keys = parseKeys(config.defines);
  if (keys.length === 0) {
    throw new Error('preview has no keys');
  }
  return { buffer, keys };
}

let activeSources: AudioBufferSourceNode[] = [];

/** Cut any burst still playing. */
function stopPreview(): void {
  const playing = activeSources;
  activeSources = [];
  for (const source of playing) {
    try {
      source.stop();
    } catch {
      // already ended — nothing to cut
    }
  }
}

function playSlice(
  audio: AudioContext,
  buffer: AudioBuffer,
  [startMs, durMs]: Slice,
  when: number,
): AudioBufferSourceNode {
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.connect(audio.destination);
  source.start(when, startMs / 1000, durMs / 1000);
  return source;
}

/** Play a short burst of random keys from the pack's preview clip. */
export async function previewPack(
  id: string,
  count = BURST_KEYS,
): Promise<void> {
  const audio = audioContext();
  if (!audio) {
    throw new Error('audio unsupported');
  }

  // Comparing packs means clicking one ▶ after another — overlapping bursts
  // would defeat the point, so a new preview always cuts the previous one.
  stopPreview();

  let pending = cache.get(id);
  if (!pending) {
    pending = load(id);
    cache.set(id, pending);
    void pending.catch(() => cache.delete(id)); // never cache a failure
  }
  const { buffer, keys } = await pending;

  await audio.resume(); // contexts start suspended until a user gesture
  let when = audio.currentTime + 0.02;
  const scheduled: AudioBufferSourceNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const key = keys[Math.floor(Math.random() * keys.length)];
    if (!key) {
      continue;
    }
    scheduled.push(playSlice(audio, buffer, key.press, when));
    if (key.release) {
      scheduled.push(
        playSlice(
          audio,
          buffer,
          key.release,
          when + HOLD_MIN_S + Math.random() * HOLD_JITTER_S,
        ),
      );
    }
    when += GAP_MIN_S + Math.random() * GAP_JITTER_S;
  }
  activeSources = scheduled;
}
