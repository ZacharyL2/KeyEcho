import { listen } from '@tauri-apps/api/event';

// What the status bar learns about a keystroke: which key, and how loud the
// sound came out (0-3). Nothing is recorded.
export interface KeyPlayed {
  key: string;
  level: number;
}

export async function onKeyPlayed(
  handler: (played: KeyPlayed) => void,
): Promise<() => void> {
  try {
    return await listen<KeyPlayed>('key-played', (event) =>
      handler(event.payload),
    );
  } catch {
    // No Tauri host (tests, browser preview): the status bar just stays idle.
    return () => {};
  }
}

/** "KeyA" -> "A", "Num7" -> "7"; everything else keeps its own name. */
export function keyLabel(raw: string): string {
  const match = /^(?:Key|Num)(.)$/.exec(raw);
  return match ? match[1] : raw;
}
