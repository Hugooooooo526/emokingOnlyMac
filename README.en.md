# EmoKing: A Smoking Simulator

English | [中文](README.md)

**No time to step outside for a smoke? There's one in the corner of your screen.**

**You're on your phone during vibe coding anyway. Why not unwind in the corner of your screen?**

A tiny macOS / Windows desk toy: light a virtual cigarette and let it slowly burn, smoke and drop ash in the corner of your screen.

No smell, no hunting for a lighter, no standing outside in the wind. The whole app is under 600 KB, with no network access, no sound and no notifications.

<img src="docs/demo.gif" width="340" alt="Demo: take a cigarette, light it, take a drag, exhale, flick the ash and stub it out">

**Current version: v0.2.0** ([downloads / changelog](https://github.com/Hugooooooo526/emokingOnlyMac/releases/latest))

| System | Download | Install | Open |
|---|---|---|---|
| Windows 10 / 11 | [EmoKing-windows.zip](https://github.com/Hugooooooo526/emokingOnlyMac/releases/latest/download/EmoKing-windows.zip) | Extract to any folder, nothing to install | Double-click `EmoKing.exe`; if blocked, click "More info → Run anyway" |
| macOS 13+ | [EmoKing-macos.zip](https://github.com/Hugooooooo526/emokingOnlyMac/releases/latest/download/EmoKing-macos.zip) | Extract and drag `EmoKing.app` into Applications | Needs approval on first launch, see [Install in a minute](#install-in-a-minute) |

**Using it on Windows:** the window appears in the bottom-right corner. Click the pack for a cigarette → click the lighter → hold the cigarette or Space to puff, release to exhale. Click the tip to flick ash, click the ashtray to stub it out, drag an object to move the window. Styles, hide, keep on top, smoke amount and quit: right-click the pack or lighter, or click the tray icon (it may be hidden under "^").

## Why you need one

- **Stuck halfway through a bug?** Hold to take a drag, release to blow it out. The bug is still there, but you feel better.
- **Just want to watch it burn?** Sure, but leave it alone for 60 seconds and it goes out. No worries, on to the next one.
- **Can't bring yourself to flick the ash?** Then wait. Eventually it gives up and drops into the ashtray on its own.
- **How many today?** The ashtray doesn't lie: butts and ash stay in it until the next day.
- **Worried it'll get in the way?** Clicks pass straight through the transparent parts of the window, so you can smoke and code at the same time.
- **Worried it'll slow your Mac down?** Under 4% CPU while smoking, and next to nothing the rest of the time.
- **Fancy a different brand?** Five packs and four Zippos, and you can mix and match.

It's just a desk toy, not a quit-smoking tool.

**Disclaimer:** This isn't here to encourage smoking. It's here to encourage unwinding and having a little space of your own. Especially if your wife won't let you smoke. If you know, you know.

## Install in a minute

Supports **macOS 13+** and **Windows 10 / 11 (64-bit)**. Linux is not supported.

### Windows: unzip and run

1. Download [EmoKing-windows.zip](https://github.com/Hugooooooo526/emokingOnlyMac/releases/latest/download/EmoKing-windows.zip) and **extract it first**. Don't run it from inside the zip.
2. Double-click `EmoKing.exe`. The window appears in the bottom-right corner; nothing to install.
3. If you see "Windows protected your PC", click "More info" → "Run anyway". The app isn't code-signed.

Controls live in the tray icon (it may be hidden under "^"); right-clicking the pack or lighter opens the same menu. Data: `%LOCALAPPDATA%\EmoKing\state.json`.

To build it yourself, run `.\windows\build.ps1 -Output (Join-Path (Get-Location) 'EmoKing.exe')` in Windows PowerShell. You need Node.js on PATH; the C# compiler comes with the built-in .NET Framework.

### Mac option 1: Download

1. Download [EmoKing-macos.zip](https://github.com/Hugooooooo526/emokingOnlyMac/releases/latest/download/EmoKing-macos.zip) and unzip it.
2. Drag `EmoKing.app` into your Applications folder.
3. macOS will block the first launch, because the app has no Apple Developer signature. Allow it in one of these ways:
   - Open System Settings → Privacy & Security, scroll down to EmoKing and click "Open Anyway"
   - Or run this in Terminal: `xattr -dr com.apple.quarantine /Applications/EmoKing.app`

If you'd rather not trust a download, all the code is here and you can build it yourself with Mac option 2.

### Mac option 2: Build from source

Requires the Xcode Command Line Tools (`xcode-select --install`).

```bash
git clone https://github.com/Hugooooooo526/emokingOnlyMac.git emoking
cd emoking
./build.sh                # creates dist/EmoKing.app, takes about a minute
open dist/EmoKing.app     # light up
```

### After installing

The app has no Dock icon. Its window appears at the bottom right of your screen, and a smoke icon appears in the menu bar.

So far it has only been run on an Apple M5 with macOS 27. The app includes both Apple silicon and Intel builds, but Intel Macs and older macOS versions are untested. Reports are welcome.

## How to smoke

The app's interface is in Chinese only, but you only need three steps: **click the pack, click the lighter, hold the cigarette.**

| Action | Result |
|---|---|
| Click the pack | Take a cigarette |
| Click the lighter | Light it, today's count goes up by 1 |
| Hold the cigarette body or the Space bar | Take a drag, release to exhale; the longer you hold, the bigger the cloud; a quick tap is a small puff |
| Click the burning tip | Flick the ash |
| Click the ashtray | Stub it out; an unlit cigarette goes back in the pack |
| Drag the pack, lighter or ashtray | Move the window |
| Click 外观 in the window (Mac) or use the right-click menu (Windows) | Change the pack and Zippo style |
| Right-click an object, or click the menu bar / tray icon | Hide, keep on top, window size, smoke amount, quit |

Things you'll find out sooner or later:

- A cigarette burns for about 4 minutes, as long as you take a drag at least once a minute. The harder you smoke, the faster it burns.
- If it goes out, it isn't wasted. Relight it with the lighter and it won't count as another one.
- Smoke amount has three levels. Set it to the highest (多) for the full fog.
- Hiding the window pauses the animation and the burning, so you can pick up where you left off.

## Changelog

### v0.2.0

- **New Windows version:** download the zip, extract it and double-click `EmoKing.exe`. No install and no WebView2 needed.
- **New styles:** five packs (Lucky Strike green, Seven Stars white, Mild Seven blue, Marlboro red, Camel classic) and four Zippos (brushed silver, vintage brass, matte black, candy red). Pick the cigarette and lighter separately; your choice is remembered. On Mac click 外观 in the window; on Windows use the right-click menu.
- **Smoke fixed:** smoke from the tip now starts as a thin wisp and spreads out as it rises. In v0.1.0 every puff appeared at full size.
- **Easier to get the window back:** on Mac, if the window is hidden, open the app again and the window comes back without starting a second copy.
- Prebuilt Mac and Windows packages in the release; added a demo GIF and this English README.

### v0.1.0

- First release: transparent floating window, take a cigarette, light it, puff and exhale, three smoke levels, flicking ash, stubbing out, auto-extinguish, daily count.

## Acceptance results

These are Mac numbers, tested on an Apple M5 with macOS 27. The Windows version hasn't been measured the same way.

| Metric | Target | Measured |
|---|---|---|
| App size | <10 MB | 596 KB (zip about 300 KB) |
| Launch to interactive | <1 s | 0.44–0.64 s |
| CPU while smoking | <5% | 3.3%–3.9% |
| CPU while idle | Near 0 | All threads asleep when the mouse is still; up to 2.0% in samples |
| Memory | About 30 MB idle | About 60 MB (idle, just after launch) |

- CPU is the total for the app and its WebKit child processes. It does not include the system's WindowServer, where the smoke is composited, so the true total is a little higher.
- Memory is the `footprint` total for the app and its WebKit child processes, which is above the 30 MB target. Memory while smoking was not measured separately.

## Known limitations

- After you click the window, it receives Space and any typing. Click another window to give the keyboard back to your other app.
- On notched MacBooks, a crowded menu bar can hide the icon. Right-click an object to open the same menu. If the window is hidden, open the app again and the window comes back.
- There is no launch at login yet.
- The app's interface is in Chinese only.
- The Windows version hasn't been fully checked on the maintainer's own Windows machine yet. Issues welcome.

## How it works

Mac: a native Swift shell with WKWebView. Windows: a C# shell that runs the same JS rules and drawing code in the system's built-in Chakra engine and shows them in a GDI layered window. No third-party dependencies on either.

- `web/sim.js`: all the game rules, no DOM access
- `web/render.js`: the visuals, plus computing each puff's full path when it's born
- `web/main.js`: input, the main loop and saving
- `native/main.swift`: transparent window, click-through, menu bar, smoke playback with Core Animation
- `windows/`: Windows floating window, tray menu and drawing bridge; build with `build.ps1`
- Data: Mac `~/Library/Application Support/EmoKing/state.json`, Windows `%LOCALAPPDATA%\EmoKing\state.json`

Each puff's path is computed once in JS and handed to Core Animation, so the web view doesn't have to commit a frame for every step of the smoke. While the cigarette burns quietly, the loop runs just 5 times a second, and it stops completely when nothing is moving.

You can also open `web/index.html` in a browser for debugging. Smoke replays the same paths on a Canvas, but there's no floating window or menu bar.

## Tests

```bash
node --test tests/sim.test.js      # game rules, needs Node.js 18+
scripts/selftest.sh /tmp/emoking   # runs the full flow in a real window and samples CPU and memory
```

`selftest.sh` uses a separate test build and separate save data, so your real data isn't touched. Some checks depend on real timing and can fail occasionally on a busy machine, so run it on its own.

`scripts/package.sh` creates `dist/EmoKing-macos.zip` for releases. The Windows package is built by GitHub Actions (`.github/workflows/windows.yml`): after pushing to main, download it from Actions; when you publish a release, `EmoKing-windows.zip` is uploaded to it automatically.

## License

[MIT](LICENSE)
