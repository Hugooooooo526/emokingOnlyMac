#!/bin/bash
# 构建并打包成 dist/EmoKing-macos.zip，用于上传到 GitHub Releases。
set -euo pipefail
cd "$(dirname "$0")/.."
./build.sh
rm -f dist/EmoKing-macos.zip
# 用 ditto 而不是 zip：保留签名和 bundle 里的元数据
ditto -c -k --keepParent dist/EmoKing.app dist/EmoKing-macos.zip
ls -la dist/EmoKing-macos.zip
shasum -a 256 dist/EmoKing-macos.zip
