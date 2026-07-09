#!/bin/bash
set -euo pipefail

rustup target add "$INPUT_TARGET"

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl wget xz-utils pkg-config

if [ "$INPUT_TARGET" = "x86_64-unknown-linux-gnu" ]; then
    apt-get install -y --no-install-recommends \
        build-essential \
        libasound2-dev \
        libayatana-appindicator3-dev \
        libgtk-3-dev \
        librsvg2-dev \
        libwebkit2gtk-4.1-dev \
        libxdo-dev \
        patchelf
elif [ "$INPUT_TARGET" = "aarch64-unknown-linux-gnu" ]; then
    dpkg --add-architecture arm64
    apt-get update
    apt-get install -y --no-install-recommends \
        g++-aarch64-linux-gnu \
        libasound2-dev:arm64 \
        libayatana-appindicator3-dev:arm64 \
        libc6-dev-arm64-cross \
        libcups2:arm64 \
        libgtk-3-dev:arm64 \
        libncurses6:arm64 \
        libncursesw6:arm64 \
        librsvg2-dev:arm64 \
        libssl3:arm64 \
        libtinfo6:arm64 \
        libwebkit2gtk-4.1-dev:arm64 \
        linux-libc-dev:arm64 \
        patchelf:arm64
    export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc
    export CC_aarch64_unknown_linux_gnu=aarch64-linux-gnu-gcc
    export CXX_aarch64_unknown_linux_gnu=aarch64-linux-gnu-g++
    export PKG_CONFIG_PATH=/usr/lib/aarch64-linux-gnu/pkgconfig
    export PKG_CONFIG_ALLOW_CROSS=1
elif [ "$INPUT_TARGET" = "armv7-unknown-linux-gnueabihf" ]; then
    dpkg --add-architecture armhf
    apt-get update
    apt-get install -y --no-install-recommends \
        g++-arm-linux-gnueabihf \
        libasound2-dev:armhf \
        libayatana-appindicator3-dev:armhf \
        libc6-dev-armhf-cross \
        libcups2:armhf \
        libgtk-3-dev:armhf \
        libncurses6:armhf \
        libncursesw6:armhf \
        librsvg2-dev:armhf \
        libssl3:armhf \
        libtinfo6:armhf \
        libwebkit2gtk-4.1-dev:armhf \
        linux-libc-dev:armhf \
        patchelf:armhf
    export CARGO_TARGET_ARMV7_UNKNOWN_LINUX_GNUEABIHF_LINKER=arm-linux-gnueabihf-gcc
    export CC_armv7_unknown_linux_gnueabihf=arm-linux-gnueabihf-gcc
    export CXX_armv7_unknown_linux_gnueabihf=arm-linux-gnueabihf-g++
    export PKG_CONFIG_PATH=/usr/lib/arm-linux-gnueabihf/pkgconfig
    export PKG_CONFIG_ALLOW_CROSS=1
else
    echo "Unknown target: $INPUT_TARGET" && exit 1
fi

NODE_SHASUMS="$(curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt)"
NODE_DIST="$(printf '%s\n' "$NODE_SHASUMS" | awk '/linux-x64.tar.xz$/ { print $2; exit }')"
if [ -z "$NODE_DIST" ]; then
    echo "Could not resolve latest Node 24 Linux distribution" >&2
    exit 1
fi
NODE_SHA256="$(printf '%s\n' "$NODE_SHASUMS" | awk -v file="$NODE_DIST" '$2 == file { print $1; exit }')"
curl -fsSLO "https://nodejs.org/dist/latest-v24.x/${NODE_DIST}"
printf '%s  %s\n' "$NODE_SHA256" "$NODE_DIST" | sha256sum -c -
tar -Jxf "./${NODE_DIST}"
export PATH="$(pwd)/${NODE_DIST%.tar.xz}/bin:$PATH"
corepack enable
corepack prepare "$(node -p "require('./package.json').packageManager")" --activate

pnpm install --frozen-lockfile
pnpm build --target "$INPUT_TARGET"
