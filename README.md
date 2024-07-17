<meta content="website" property="og:type" />
<meta content="https://github.com/ZacharyL2/KeyEcho" property="og:url" />
<meta
  content="KeyEcho: Listen to Mechanical Keyboard Sounds with Every Keystroke - It's Fast"
  property="og:title"
/>
<meta
  content="Listen to your keyboard typing and echo pleasant sounds"
  property="og:description"
/>
<meta content="Open-Sourced KeyEcho" property="og:site_name" />
<meta
  content="https://i.imgur.com/ov3Nyai.png"
  property="og:image"
/>
<meta content="1200" property="og:image:width" />
<meta content="630" property="og:image:height" />
<meta
  content="Listen to your keyboard typing and echo pleasant sounds"
  property="og:image:alt"
/>
<meta content="https://github.com/ZacharyL2/KeyEcho" name="twitter:url" />
<meta
  content="KeyEcho: Listen to Mechanical Keyboard Sounds with Every Keystroke - It's Fast"
  name="twitter:title"
/>
<meta
  content="Listen to your keyboard typing and echo pleasant sounds"
  name="twitter:description"
/>
<meta
  content="https://i.imgur.com/ov3Nyai.png"
  name="twitter:image"
/>
<meta content="summary_large_image" name="twitter:card" />

![KeyEcho Logo](https://i.imgur.com/ov3Nyai.png)

# KeyEcho

> Listen to your keyboard typing and echo pleasant sounds

- ⚡️ Minimal CPU and memory usage, instant keystroke response
- 📦 Less than 5 MB in size, cross-platform compatibility
- 🛠️ Customizable sounds to suit your preferences

[More about its performance comparison and under the hood.](https://webdeveloper.beehiiv.com/p/opensourced-keyecho-fastresponsive-keyboard-sounds-every-keystroke-using-tauri)

## 🚀 Install

Supports Windows (64-bit/ARM64), macOS (Intel/Apple M1/M2), and Linux (64-bit/ARM64/ARMv7).

Visit the [release page](https://github.com/ZacharyL2/KeyEcho/releases) to download the appropriate installation package.

## 🧑‍💻 Development

### Prerequisites

#### Installing Rust and Cargo

Cargo is the package manager for Rust. If you don't have it installed, follow these steps:

1. Visit the [Rust installation page](https://www.rust-lang.org/tools/install).
2. Follow the instructions for your operating system to install Rust and Cargo.
3. Verify the installation by running `cargo --version` in your terminal.

#### Installing pnpm

pnpm is a fast, disk space-efficient package manager for JavaScript. To install:

1. Visit the [pnpm installation page](https://pnpm.io/installation).
2. Choose the installation method that suits your operating system.
3. Verify the installation by running `pnpm --version` in your terminal.

### Building and Running the Project

```bash
# Clone the repository
$ git clone git@github.com:ZacharyL2/KeyEcho.git
$ cd KeyEcho

# Install dependencies
$ pnpm install

# Build the Rust backend
$ cd src-tauri
$ cargo build
$ cd ..

# Run the development server
$ pnpm dev

# Build for production
$ pnpm build

# To run the Rust backend separately:

$ cd src-tauri
$ cargo run

# Then, from the root of the project, start the frontend:

$ pnpm dev
```