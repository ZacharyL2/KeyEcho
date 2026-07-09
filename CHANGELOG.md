# Changelog

## v1.0.0

### Features

- Migrate the desktop app to Tauri 2 and SolidJS, replacing the Vue dashboard with a smaller Solid + UnoCSS settings window
- Rework the dashboard into a compact app card with clearer sound pack selection, pack browsing, volume, auto launch, and project update controls
- Add readable display names for bundled and downloaded sound packs
- Add a v1.0.0 project update card that links users to the KeyEcho sound pack vote and founding bundle pages
- Add Tauri 2 capability configuration and refreshed command bindings between the frontend and Rust backend
- Replace the app and tray icon set with a new KeyEcho-specific design
- Add performance documentation for the audio hot path and sound pack memory budget

### Performance

- Predecode the selected sound pack when it is selected, so key presses no longer perform OGG seek/decode work
- Reuse shared `Arc<[f32]>` sample buffers so each playback clones only lightweight metadata instead of copying sample data
- Deduplicate identical `[start_ms, duration_ms]` sound slices during sound pack loading
- Remove the global sound pack mutex from the playback hot path by using lock-free current-sound and volume reads
- Send only key press events to the audio thread, avoiding release-event playback work
- Bound the audio event queue to 256 events so overloaded playback drops new events instead of growing memory and latency without limit
- Enforce a 10 MiB decoded sample memory budget for downloaded and custom sound packs before playback predecode
- Document reference results for `cherrymx-black-abs`: cached lookup now averages 43.25 ns/op, 13.7x faster than the v0.0.5 cached model, with 0 sample bytes copied per playback

### Security and Signing

- Publish certified Windows and macOS packages: Windows installers are Authenticode-signed, and macOS builds are Developer ID signed, notarized, stapled, and verified
- Add a dedicated signed build workflow for macOS Intel, macOS Apple Silicon, Windows x64, and Windows ARM64 packages
- Add Windows Azure Artifact Signing preflight, NSIS installer signing, and Authenticode verification before publishing signed artifacts
- Modernize the release workflow with verify jobs before release publishing, narrower GitHub token permissions, concurrency control, Node 24, pnpm cache, stable Rust, and explicit release artifact uploads
- Update Tauri updater generation to read release notes from `CHANGELOG.md`, select the latest semver GitHub release, reject ambiguous macOS updater artifacts, and fail when updater signatures are missing
- Publish arch-specific updater artifacts for Windows, macOS, and Linux instead of relying on ambiguous asset names
- Validate sound pack download URLs and redirects so app downloads only official HTTPS `.tar` archives from the KeyEcho repository
- Reject oversized sound archives, unsafe tar paths, symlinks, and unsupported tar entry types during sound pack extraction
- Restrict app-opened external URLs to `keyecho.app` and the official KeyEcho GitHub repository

### Fixes

- Keep the app alive in the tray while destroying the dashboard WebView on close, then recreate and focus the dashboard when reopened
- Make the settings window resizable and increase its default size for the rebuilt dashboard
- Improve macOS modifier key press and release handling by tracking left/right modifier state independently
- Clean up Windows keyboard hook callback state and unhook the low-level keyboard hook when the message loop exits
- Clean up Linux XRecord callback state, record ranges, display handles, and record contexts on listener shutdown or failure
- Reopen the audio output when the default device becomes unavailable or the stream is invalidated
- Clamp persisted volume to the supported range and reject non-finite volume values
- Fix updater platform mapping for Windows, macOS, and Linux, including not mapping Linux x64 updater artifacts to ARM platforms
- Fix Windows signing test command path, quoting, wrapper generation, preflight, and signature verification

### Resolved GitHub issues

- Address unsigned-code macOS launch warnings, update permission churn, and Windows false positives by moving Windows and macOS releases to signed, verified packages (#3, #8, #16, #18, #19, #24, #43)
- Address output device switching so KeyEcho follows default output device changes without requiring a tray restart (#20, #41)
- Address NK Cream and online sound download failures by deriving pack names from official archives and safely extracting packs into the expected app data layout (#31, #32, #34)
- Address app and menu bar icon feedback with a new KeyEcho-specific icon set (#28)

---

## v0.0.5

### Features

- Add up to 10 audio options
- Add RPM packaging
- Optimize GUI display

### Fixes

- Remove default key mapping to 'A' key

---

## v0.0.4

### Features

- Added auto launch option
- Added volume control option
- Added success/failure toasts for all options
- Removed AppImage support
- Optimized UI display

---

## v0.0.3

### Features

- Added 8 audio options
- Further optimized performance by using separate threads for key listening and sound playback
- Adjusted logo to an appropriate size
- UI display optimizations

### Fixes

- Fixed potential errors when switching default playback devices
- Resolved default corruption issue on MacOS ARM

---

## v0.0.2

### Features

- Brand new logo
- Default to not create a window to optimize performance
- Removed right-click refresh button
- Improved system tray interaction
- UI display optimization

---

## v0.0.1

### Features

- MVP
