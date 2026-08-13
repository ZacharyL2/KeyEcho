# Performance Notes

## v1.0 Audio Path

KeyEcho 1.0 makes key playback more predictable by moving expensive work out of
the key-press path.

When a sound pack is selected, KeyEcho now:

- validates the archive and sound-pack budget,
- deduplicates identical `[start_ms, duration_ms]` slices,
- decodes each unique OGG slice once,
- stores decoded samples in shared `Arc<[f32]>` buffers.

When a key is pressed, playback now:

- sends one event to a bounded audio queue,
- loads the current sound without a global sound-pack mutex,
- clones an `Arc<[f32]>` handle instead of a sample buffer,
- reads volume through an atomic value.

The key-press path no longer performs:

- OGG seek/decode,
- sample-buffer copies,
- global sound-pack mutex locks,
- key-release playback messages,
- unbounded queue growth.

Tradeoff: selected packs use more memory up front. Downloaded and custom packs
are rejected before predecode if their estimated decoded size exceeds 10 MiB at
48 kHz stereo f32.

## Reference Pack

The numbers below use the bundled `cherrymx-black-abs` pack.

| Metric                                         |  Value |
| ---------------------------------------------- | -----: |
| Defined keys                                   |    104 |
| Unique audio slices after dedupe               |     86 |
| Duplicate key slices removed from sample store |     18 |
| Decoded sample storage saved by dedupe         | 17.82% |

These pack counts come from the sound-pack config. The timings below are release
microbenchmarks, not end-to-end speaker latency measurements.

## Reference Timings

Measured with release builds on the same machine:

```text
cargo test --release --manifest-path src-tauri\Cargo.toml reference_timing -- --ignored --nocapture
```

Baseline: local `v0.0.5` release tag
`fee5596925a6403b2bf84cd60cc271534c2d674c`.

| Measurement                                  | v0.0.5 release                      | v1.0 branch                            | Change                         |
| -------------------------------------------- | ----------------------------------- | -------------------------------------- | ------------------------------ |
| Cached lookup, average-size slice (`194 ms`) | `1184.07 ns/op`, `66.84 KiB` copied | `43.50 ns/op`, `0` sample bytes copied | `27.2x` faster                 |
| Cached lookup, largest slice (`287 ms`)      | `1638.57 ns/op`, `98.88 KiB` copied | `43.10 ns/op`, `0` sample bytes copied | `38.0x` faster                 |
| Press/release gate, CPU only                 | `58.82 ns/tap`, 2 playback messages | `54.69 ns/tap`, 1 playback message     | similar CPU, half the messages |

The lookup benchmark compares the old cached model's mutex-protected owned
sample-buffer clone with the v1.0 shared-buffer path. It intentionally excludes
audio device I/O, which depends on OS scheduling and hardware.

## Memory Budget

`cherrymx-black-abs` decoded sample storage after slice dedupe:

| Format          | Before dedupe | After dedupe |     Saved |
| --------------- | ------------: | -----------: | --------: |
| 44.1 kHz mono   |     3.385 MiB |    2.782 MiB | 0.603 MiB |
| 44.1 kHz stereo |     6.771 MiB |    5.564 MiB | 1.207 MiB |
| 48 kHz mono     |     3.685 MiB |    3.028 MiB | 0.657 MiB |
| 48 kHz stereo   |     7.370 MiB |    6.056 MiB | 1.313 MiB |

Bundled and downloaded packs are checked against these limits before predecode:

| Budget                                      |        Limit |
| ------------------------------------------- | -----------: |
| Defined keys                                |     `<= 104` |
| Unique `[start_ms, duration_ms]` slices     |     `<= 104` |
| Unique predecoded duration                  |   `<= 18.5s` |
| Estimated decoded memory, 48 kHz stereo f32 |  `<= 10 MiB` |
| Estimated largest single-key buffer         | `<= 512 KiB` |

Current maximums across bundled packs:

| Metric                                       |                       Current max |
| -------------------------------------------- | --------------------------------: |
| Defined keys                                 |                             `104` |
| Unique slices                                |                 `103` (`eg-oreo`) |
| Unique predecoded duration                   |            `17.884s` (`nk-cream`) |
| Decoded memory, 48 kHz stereo f32            |           `6.55 MiB` (`nk-cream`) |
| Largest single-key buffer, 48 kHz stereo f32 | `447.75 KiB` (`cherrymx-red-pbt`) |

Compared with `v0.0.5`, v1.0 uses more memory immediately after selecting a pack
because it predecodes unique slices up front. That tradeoff removes decode and
sample-copy work from key playback.

## Audio Device Routing

Default output-device following is delegated to `cpal 0.18.1` through the
`rodio` Git dependency. Key playback does not poll devices on the hot path.

## Verification

Last full verification for the v1.0 branch:

- `rtk pnpm test`
  - Rust unit tests: 25 passed
  - Vitest unit tests: 11 passed
  - frontend typecheck and production build: passed
- `rtk pnpm run bench:audio`: 2 ignored-by-default reference benchmarks passed
- `rtk cargo check --manifest-path src-tauri\Cargo.toml`: passed

The Rust tests cover shared sample storage, bounded queue capacity, press/release
gating, runtime sound-pack memory limits, slice dedupe, lock-free playback state
updates, and bundled sound-pack budgets.
