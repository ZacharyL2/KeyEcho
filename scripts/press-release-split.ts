export type SoundSlice = [startMs: number, durationMs: number];

export interface PressReleaseSlices {
  press: SoundSlice;
  release: SoundSlice;
}

const MAX_EVENT_DURATION_MS = 95;
const MIN_TRANSIENT_SEPARATION_MS = 20;

function strongestIndex(
  envelope: readonly number[],
  start: number,
  end: number,
): number {
  let strongest = start;
  for (let index = start + 1; index < end; index += 1) {
    if (envelope[index] > envelope[strongest]) strongest = index;
  }
  return strongest;
}

function onsetIndex(envelope: readonly number[], peakIndex: number): number {
  const threshold = envelope[peakIndex] * 0.12;
  let onset = peakIndex;
  while (onset > 0 && envelope[onset - 1] > threshold) onset -= 1;
  return Math.max(0, onset - 1);
}

export function splitSoundSlice(
  source: SoundSlice,
  envelope: readonly number[],
  frameDurationMs: number,
): PressReleaseSlices | undefined {
  const [sourceStartMs, sourceDurationMs] = source;
  if (
    sourceDurationMs <= 0 ||
    envelope.length < 4 ||
    !Number.isFinite(frameDurationMs) ||
    frameDurationMs <= 0
  ) {
    return undefined;
  }

  const pressSearchEnd = Math.max(1, Math.ceil(envelope.length * 0.6));
  const pressPeak = strongestIndex(envelope, 0, pressSearchEnd);
  const releaseSearchStart = Math.max(
    pressPeak + Math.ceil(MIN_TRANSIENT_SEPARATION_MS / frameDurationMs),
    Math.floor(envelope.length * 0.45),
  );
  if (releaseSearchStart >= envelope.length) return undefined;

  const releasePeak = strongestIndex(
    envelope,
    releaseSearchStart,
    envelope.length,
  );
  const globalPeak = Math.max(...envelope);
  if (globalPeak <= 0 || envelope[releasePeak] < globalPeak * 0.04) {
    return undefined;
  }

  const splitFrame = Math.floor((pressPeak + releasePeak) / 2);
  const pressStartFrame = onsetIndex(envelope, pressPeak);
  const pressEndFrame = Math.min(
    splitFrame,
    pressStartFrame + Math.ceil(MAX_EVENT_DURATION_MS / frameDurationMs),
  );
  const releaseStartFrame = Math.max(
    pressEndFrame,
    onsetIndex(envelope, releasePeak),
  );
  const sourceEndMs = sourceStartMs + sourceDurationMs;
  const releaseEndFrame = Math.min(
    envelope.length,
    releaseStartFrame + Math.ceil(MAX_EVENT_DURATION_MS / frameDurationMs),
  );

  const pressStartMs = sourceStartMs + pressStartFrame * frameDurationMs;
  const pressEndMs = Math.min(
    sourceEndMs,
    sourceStartMs + pressEndFrame * frameDurationMs,
  );
  const releaseStartMs = Math.min(
    sourceEndMs,
    sourceStartMs + releaseStartFrame * frameDurationMs,
  );
  const releaseEndMs = Math.min(
    sourceEndMs,
    sourceStartMs + releaseEndFrame * frameDurationMs,
  );
  if (pressEndMs <= pressStartMs || releaseEndMs <= releaseStartMs) {
    return undefined;
  }

  return {
    press: [Math.round(pressStartMs), Math.round(pressEndMs - pressStartMs)],
    release: [
      Math.round(releaseStartMs),
      Math.round(releaseEndMs - releaseStartMs),
    ],
  };
}
