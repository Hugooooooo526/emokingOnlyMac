#!/bin/bash
# 生成 dist/EmoKing.app。只需要 Xcode 命令行工具。
set -euo pipefail
cd "$(dirname "$0")"

APP=dist/EmoKing.app
SDK=$(xcrun --show-sdk-path)

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"

for arch in arm64 x86_64; do
  xcrun swiftc -O -swift-version 5 -sdk "$SDK" -target "$arch-apple-macos13.0" \
    native/main.swift -o "dist/EmoKing-$arch"
done
lipo -create dist/EmoKing-arm64 dist/EmoKing-x86_64 -output "$APP/Contents/MacOS/EmoKing"
rm dist/EmoKing-arm64 dist/EmoKing-x86_64

cp native/Info.plist "$APP/Contents/Info.plist"
cp LICENSE "$APP/Contents/Resources/LICENSE"
cp web/index.html web/style.css web/sim.js web/render.js web/main.js "$APP/Contents/Resources/web/"
[ -f native/AppIcon.icns ] && cp native/AppIcon.icns "$APP/Contents/Resources/"

codesign --force --sign - "$APP"
du -sh "$APP"
