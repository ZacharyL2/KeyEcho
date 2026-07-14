import { describe, expect, it } from 'vitest';

import { splitSoundSlice } from './press-release-split';

function contains(slice: [number, number], timestampMs: number): boolean {
  const [startMs, durationMs] = slice;
  return timestampMs >= startMs && timestampMs < startMs + durationMs;
}

describe('press/release sound splitting', () => {
  it('separates two distinct transients inside the original sound slice', () => {
    const result = splitSoundSlice(
      [1_000, 100],
      [0.01, 0.04, 1, 0.2, 0.03, 0.01, 0.02, 0.1, 0.8, 0.05],
      10,
    );

    expect(result).toBeDefined();
    expect(contains(result!.press, 1_020)).toBe(true);
    expect(contains(result!.release, 1_080)).toBe(true);
    expect(result!.press[0] + result!.press[1]).toBeLessThanOrEqual(
      result!.release[0],
    );
  });
});
