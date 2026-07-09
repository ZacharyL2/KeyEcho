# Performance Notes

## 2026-06-24 Audio Hot Path Optimization

Measured against the currently selected local soundpack:

- Soundpack: `cherrymx-black-abs`
- Config path: `%APPDATA%\xyz.waveapps.keyecho\sounds\cherrymx-black-abs\config.json`
- Defined keys: 104
- Unique audio slices after `[start_ms, duration_ms]` dedupe: 86
- Duplicate key slices removed from decoded storage: 18

These numbers are deterministic reductions from the current soundpack config and audio source
representation, not hardware timing benchmarks.

### Release Baseline Timing

Reference timings were measured on the same machine with release builds:

```text
cargo test --release --manifest-path src-tauri\Cargo.toml reference_timing -- --ignored --nocapture
```

Baseline: local `v0.0.5` release tag (`fee5596925a6403b2bf84cd60cc271534c2d674c`).

| Path                                              | v0.0.5 release | Current branch | Speedup | Latency reduction |
| ------------------------------------------------- | -------------: | -------------: | ------: | ----------------: |
| Cached audio lookup, avg `cherrymx-black-abs` key |   594.14 ns/op |    43.25 ns/op |   13.7x |             92.7% |
| Cached audio lookup, max `cherrymx-black-abs` key |   916.82 ns/op |    43.13 ns/op |   21.3x |             95.3% |
| Press/release gate CPU only                       |   57.01 ns/tap |   53.90 ns/tap |   1.06x |              5.5% |

The lookup benchmark compares the release hot path's cached `Mutex + LruCache + Vec<i16>` clone
against the current hot path's `ArcSwap + Arc<[f32]>` clone. It does not include actual audio device
I/O, which depends on hardware and OS scheduling.

The gate benchmark intentionally measures CPU only. The larger behavioral change is that a normal
tap now sends 1 audio-thread message instead of 2.

### Decoded Sample Memory

The decoded sample memory estimate is:

```text
duration_seconds * sample_rate * channel_count * 4 bytes
```

For this soundpack:

| Format          | Before slice dedupe | After slice dedupe |     Saved |
| --------------- | ------------------: | -----------------: | --------: |
| 44.1 kHz mono   |           3.385 MiB |          2.782 MiB | 0.603 MiB |
| 44.1 kHz stereo |           6.771 MiB |          5.564 MiB | 1.207 MiB |
| 48 kHz mono     |           3.685 MiB |          3.028 MiB | 0.657 MiB |
| 48 kHz stereo   |           7.370 MiB |          6.056 MiB | 1.313 MiB |

Slice dedupe reduces decoded sample storage by 17.82% for this soundpack.

### Per-Key Playback Allocation

Before shared sample buffers, each playback cloned the full `Vec<f32>` for the key sound.
For this soundpack, that removed clone was:

| Format          | Average removed copy per playback | Maximum removed copy per playback |
| --------------- | --------------------------------: | --------------------------------: |
| 44.1 kHz mono   |                         33.33 KiB |                         49.44 KiB |
| 44.1 kHz stereo |                         66.67 KiB |                         98.88 KiB |
| 48 kHz mono     |                         36.28 KiB |                         53.81 KiB |
| 48 kHz stereo   |                         72.56 KiB |                        107.62 KiB |

Current playback clones only an `Arc<[f32]>` handle plus small source metadata.

Compared with `v0.0.5`, this removes the release hot path's cached `Vec<i16>` copy:

| Key size                         | v0.0.5 copied per playback | Current copied per playback |
| -------------------------------- | -------------------------: | --------------------------: |
| Average `cherrymx-black-abs` key |                  33.42 KiB |              0 sample bytes |
| Largest `cherrymx-black-abs` key |                  49.44 KiB |              0 sample bytes |

### Current Playback Hot Path

For a key press that should play sound, the hot path now performs:

- One bounded `crossbeam-channel` `try_send` from the key listener and one receive on the audio
  thread.
- One `ArcSwapOption` load for the current sound.
- One `Arc<[f32]>` handle clone for the predecoded sample storage.
- One atomic `u32` load for volume.

The hot path does not perform:

- OGG seek/decode.
- `Vec<f32>` sample clone.
- Global soundpack `Mutex` lock.
- Key-release playback message.
- Unbounded queue growth.

The audio event queue capacity is fixed at 256 events. If the audio thread is overloaded, new key
sounds are dropped instead of allowing memory and latency to grow without a bound.

### Event Path

For a normal key tap:

- Audio-thread messages reduced from 2 to 1, because `KeyRelease` no longer enters playback.
- Pressed-key state mutex acquisitions reduced from 2 to 0; the listener owns the `HashSet` directly.
- Global soundpack mutex acquisitions on the playback path reduced from 2 to 0.
- Runtime OGG seek/decode on key press was removed; all slices are decoded when the soundpack is selected.

### Bundled Soundpack Budgets

The Rust test suite reads every `src-tauri/resources/*.tar` soundpack config and enforces these
budgets:

- Defined keys: `<= 104`
- Unique `[start_ms, duration_ms]` slices: `<= 104`
- Unique predecoded duration: `<= 18.5s`
- Estimated decoded sample memory at 48 kHz stereo f32: `<= 10 MiB`
- Estimated largest single-key sample buffer at 48 kHz stereo f32: `<= 512 KiB`

Current maximums across bundled soundpacks:

| Metric                                       |                     Current max |
| -------------------------------------------- | ------------------------------: |
| Defined keys                                 |                             104 |
| Unique slices                                |                 103 (`eg-oreo`) |
| Unique predecoded duration                   |            17.884s (`nk-cream`) |
| Decoded sample memory, 48 kHz stereo f32     |           6.55 MiB (`nk-cream`) |
| Largest single-key buffer, 48 kHz stereo f32 | 447.75 KiB (`cherrymx-red-pbt`) |

Runtime soundpack loading uses the same hard budget of 10 MiB estimated at 48 kHz stereo f32. The
estimate is computed from unique `[start_ms, duration_ms]` slices before decoding. Oversized
downloaded or custom soundpacks are rejected before predecode, so they cannot push the playback path
into unexpectedly high memory use.

Memory tradeoff against `v0.0.5`: the release build used lazy LRU caching, so initial memory was
lower. For `cherrymx-black-abs`, the old LRU-50 cache is about 1.63 MiB for 50 average keys and
1.79 MiB for the largest 50 keys at 44.1 kHz stereo i16. The current branch predecodes unique slices
up front, about 5.56 MiB at 44.1 kHz stereo f32 for this pack, to remove decode/copy work from the
key press path and keep latency stable.

### Audio Device Routing

Default output device following is delegated to `cpal 0.18.1` through the `rodio` Git dependency.
No polling is performed on the key playback hot path.

### Verification

- `rtk pnpm test`
  - Rust unit tests: 15 passed
  - Rust reference benchmarks: 2 ignored by default
  - Vitest unit tests: 4 passed
  - Frontend typecheck and Vite production build: passed
- `rtk pnpm run bench:audio`: 2 release reference benchmarks passed
- `rtk cargo check --manifest-path src-tauri\Cargo.toml`: passed
- `rtk pnpm outdated`: all packages up-to-date

The Rust tests cover:

- `AudioSource` exact sample counts, duration metadata, and clone-time shared sample storage.
- Bounded audio event queue capacity.
- Press/release gating so repeated keydown events do not enqueue extra playback.
- Runtime soundpack memory budget enforcement at 10 MiB.
- Soundpack predecode dedupe so identical `[start_ms, duration_ms]` slices decode once and share
  sample storage while each playback gets an independent cursor.
- Lock-free playback state updates for current sound and volume.
- Bundled soundpack memory budgets.

The Vitest tests cover Tauri command binding success/error wrapping and argument forwarding.
