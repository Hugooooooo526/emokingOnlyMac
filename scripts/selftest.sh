#!/bin/bash
# 构建带自检的版本，跑一遍并采样 CPU / 内存。用法：scripts/selftest.sh <输出目录>
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${1:?输出目录}
mkdir -p "$OUT"; rm -f "$OUT"/log.txt "$OUT"/stage "$OUT"/*.png "$OUT"/state.json
APP="$OUT/EmoKingTest.app"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"
xcrun swiftc -O -swift-version 5 -D EMOKING_TEST -sdk "$(xcrun --show-sdk-path)" \
  -target "$(uname -m)-apple-macos13.0" native/main.swift tests/selftest.swift -o "$APP/Contents/MacOS/EmoKing"
cp native/Info.plist "$APP/Contents/Info.plist"
cp web/index.html web/style.css web/sim.js web/render.js web/main.js "$APP/Contents/Resources/web/"
codesign --force --sign - "$APP"

EMOKING_T0=$(python3 -c "import time;print(time.time())") EMOKING_OUT="$OUT" "$APP/Contents/MacOS/EmoKing" &
PID=$!

pids() { echo "$PID $(pgrep -P 1 -f 'com.apple.WebKit.(WebContent|GPU|Networking)' | tr '\n' ' ')"; }
cputime() { # 累计 CPU 秒数
  for p in $1; do ps -o time= -p "$p" 2>/dev/null; done |
    awk '{n=split($1,a,":"); s=0; for(i=1;i<=n;i++) s=s*60+a[i]; t+=s} END{printf "%.2f", t}'
}
rss() { for p in $1; do ps -o rss= -p "$p" 2>/dev/null; done | awk '{t+=$1} END{printf "%.0f", t/1024}'; }
waitstage() { until [ "$(cat "$OUT/stage" 2>/dev/null)" = "$1" ]; do kill -0 $PID 2>/dev/null || return 1; sleep 0.2; done; }
sample() {
  local P; P=$(pids); local a; a=$(cputime "$P")
  local per=""; for p in $P; do per="$per $p:$(cputime "$p")"; done
  sleep "$2"
  local b; b=$(cputime "$P")
  local detail=""; for e in $per; do p=${e%%:*}; d=$(awk -v a="${e##*:}" -v b="$(cputime "$p")" -v t="$2" 'BEGIN{printf "%.1f", (b-a)/t*100}')
    detail="$detail $(ps -o comm= -p "$p" 2>/dev/null | sed 's/.*[./]//')=$d%"; done
  echo "$1: CPU $(awk -v a="$a" -v b="$b" -v d="$2" 'BEGIN{printf "%.1f", (b-a)/d*100}')%  内存 $(rss "$P") MB [$detail ]"
}
waitstage passive && sample 放着烧 11
waitstage lit && sample 一直吸 20
waitstage idle && sample 空闲 12
wait $PID || true
