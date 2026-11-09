# 吸烟模拟器 EmoKing

[English](README.en.md) | 中文

**没空下楼抽一根？屏幕右下角有。**

**反正 vibe coding 也是耍手机，右下角放松一下？**

一个 Mac / Windows 桌面小摆件：点一支虚拟的烟，让它在屏幕角落慢慢烧、冒烟、掉灰。

没有烟味，不用找打火机，也不用下楼吹风。整个 App 不到 600 KB，不联网，不出声，不弹通知。

<img src="docs/demo.gif" width="340" alt="演示：拿烟、点烟、吸一口吐烟、抖灰、掐灭">

**当前版本：v0.2.0**（[下载 / 更新日志](https://github.com/Hugooooooo526/emokingOnlyMac/releases/latest)）

| 系统 | 下载 | 安装 | 打开 |
|---|---|---|---|
| Windows 10 / 11 | [EmoKing-windows.zip](https://github.com/Hugooooooo526/emokingOnlyMac/releases/latest/download/EmoKing-windows.zip) | 解压到任意文件夹，不用安装 | 双击 `EmoKing.exe`；被拦就点“更多信息 → 仍要运行” |
| macOS 13+ | [EmoKing-macos.zip](https://github.com/Hugooooooo526/emokingOnlyMac/releases/latest/download/EmoKing-macos.zip) | 解压，把 `EmoKing.app` 拖进“应用程序” | 第一次需要放行，见[一分钟装好](#一分钟装好) |

**Windows 怎么用：** 窗口出现在屏幕右下角。点烟盒拿烟 → 点打火机点上 → 按住烟或空格吸一口，松手吐烟；点烟头抖灰，点烟灰缸掐灭，拖动物件挪窗口。换款、隐藏、置顶、烟量、退出：右键烟盒或打火机，或点右下角托盘图标（可能收在“^”里）。

## 为什么你需要来一根

- **Bug 改到一半？** 按住吸一口，松手吐出去。Bug 还在，但你好多了。
- **想放着单纯看烟烧？** 可以，但 60 秒不吸它就自己灭了。没关系，下一根继续吧。
- **烟灰舍不得抖？** 那就等着，它撑不住了会自己断，掉进烟灰缸。
- **今天抽了几根？** 烟灰缸不会骗你：烟头和烟灰都留在里面，第二天才清空。
- **怕挡着干活？** 窗口透明的地方鼠标直接穿过去，抽烟写代码两不误。
- **怕拖慢电脑？** 抽烟时 CPU 不到 4%，不抽的时候几乎不占。
- **想换个牌子？** 5 款烟盒、4 款 Zippo 随便换，烟和打火机可以分开搭。

它只是个桌面玩具，不是戒烟工具。

**免责声明：** 不是鼓励吸烟，而是鼓励解压和拥有自己的空间。特别是老婆不让抽的，能 get 到的人都知道。

## 一分钟装好

支持 **macOS 13+** 和 **Windows 10 / 11（64 位）**，不支持 Linux。

### Windows：解压就能用

1. 下载 [EmoKing-windows.zip](https://github.com/Hugooooooo526/emokingOnlyMac/releases/latest/download/EmoKing-windows.zip)，**先解压**，不要在压缩包里直接双击。
2. 双击 `EmoKing.exe`，窗口出现在屏幕右下角，不用安装。
3. 如果弹出“Windows 已保护你的电脑”，点“更多信息”→“仍要运行”。这是因为没有购买代码签名证书。

控制入口在右下角托盘图标（可能收在“^”里），在烟盒或打火机上右键也能打开同一个菜单。存档在 `%LOCALAPPDATA%\EmoKing\state.json`。

想自己构建：在 Windows PowerShell 里运行 `.\windows\build.ps1 -Output (Join-Path (Get-Location) 'EmoKing.exe')`，需要 PATH 里有 Node.js，C# 编译器用系统自带的 .NET Framework。

### Mac 方式一：直接下载

1. 下载 [EmoKing-macos.zip](https://github.com/Hugooooooo526/emokingOnlyMac/releases/latest/download/EmoKing-macos.zip)，解压。
2. 把 `EmoKing.app` 拖进“应用程序”文件夹。
3. 第一次打开时系统会拦一下，因为这个 App 没有 Apple 开发者签名。选一种方式放行：
   - 打开“系统设置 → 隐私与安全性”，往下找到 EmoKing，点“仍要打开”
   - 或者在终端运行：`xattr -dr com.apple.quarantine /Applications/EmoKing.app`

不放心的话，代码都在这里，可以用 Mac 方式二自己构建。

### Mac 方式二：从源码构建

需要 Xcode 命令行工具（`xcode-select --install`）。

```bash
git clone https://github.com/Hugooooooo526/emokingOnlyMac.git emoking
cd emoking
./build.sh                # 生成 dist/EmoKing.app，约 1 分钟
open dist/EmoKing.app     # 点上
```

### 装好之后

Mac 版没有 Dock 图标。启动后窗口出现在屏幕右下角，屏幕顶部菜单栏会多一个烟雾图标。

目前只在 Apple M5、macOS 27 上实际运行过。App 同时包含 Apple 芯片和 Intel 版本，但 Intel 机器和较旧的 macOS 版本还没有实测，欢迎试完告诉我。

## 怎么抽

三步上手：**点烟盒，点打火机，按住烟。**

| 操作 | 效果 |
|---|---|
| 点烟盒 | 拿一支烟 |
| 点打火机 | 点上，今日计数 +1 |
| 按住烟身或空格 | 吸一口，松手吐烟；按得越久吐得越多，轻点是小口 |
| 点烟头 | 抖灰 |
| 点烟灰缸 | 掐灭；没点过的烟会放回烟盒 |
| 拖烟盒、打火机或烟灰缸 | 挪动窗口 |
| 点窗口里的「外观」（Mac）或右键菜单（Windows） | 换烟盒和 Zippo 款式 |
| 在物件上右键，或点菜单栏 / 托盘图标 | 隐藏、置顶、窗口大小、烟量、退出 |

一些你迟早会发现的事：

- 一支烟放着约 4 分钟烧完，但前提是至少每分钟吸一口；吸得越猛，烧得越快。
- 灭了也不浪费，用打火机重新点上，不会多算一支。
- 烟量有少、标准、多三档，想云雾缭绕就开到“多”。
- 窗口隐藏后动画和燃烧都会暂停，回来接着抽。

## 更新日志

### v0.2.0

- **新增 Windows 版：** 下载 zip，解压后双击 `EmoKing.exe` 就能用，不用安装，也不依赖 WebView2。
- **新增换款：** 5 款烟盒（绿拉、七星白盒、柔和七星蓝、红万宝路、经典骆驼）和 4 款 Zippo（拉丝银、复古黄铜、哑光黑、糖果红），烟和打火机可以分开换，选择会记住。Mac 点窗口里的「外观」，Windows 用右键菜单。
- **烟雾修好了：** 烟头冒出的烟先是细细一缕，越飘越散开。v0.1.0 里烟雾一出来就是最大尺寸。
- **找回窗口更容易：** Mac 上窗口隐藏后，再打开一次 App，窗口会直接回来，不会多开一份。
- Release 里提供 Mac 和 Windows 的预编译包；新增演示动图和[英文 README](README.en.md)。

### v0.1.0

- 首个版本：透明悬浮窗、拿烟、点烟、吸烟吐烟、三档烟量、抖灰、掐灭、自动熄灭、今日计数。

## 验收结果

以下是 Mac 版数据，测试环境：Apple M5，macOS 27。Windows 版没有做同样的测量。

| 指标 | 目标 | 实测 |
|---|---|---|
| 安装包 | <10 MB | 596 KB（zip 约 300 KB） |
| 启动到可交互 | <1 秒 | 0.44～0.64 秒 |
| 抽烟时 CPU | <5% | 3.3%～3.9% |
| 空闲 CPU | 接近 0 | 鼠标不动时线程全部休眠；采样时最高 2.0% |
| 内存 | 空闲约 30 MB | 约 60 MB（刚启动空闲时） |

- CPU 是 App 和 WebKit 子进程的合计，不含系统 WindowServer，烟雾的合成开销在 WindowServer 里，所以实际总开销会更高一点。
- 内存是 App 和 WebKit 子进程的 `footprint` 合计，高于 30 MB 的目标；抽烟时的内存没有单独测量。

## 已知限制

- 点过窗口后，空格和打字都会被它接收，要点一下别的窗口，键盘才会回到原来的 App。
- 刘海屏上菜单栏太满时，图标可能被挤掉。这时可以在物件上右键打开同一个菜单；窗口隐藏了就再打开一次 App，窗口会回来。
- 暂时不支持开机自启。
- App 界面只有中文。
- Windows 版还没有在维护者自己的 Windows 机器上完整验收，遇到问题欢迎提 Issue。

## 技术实现

Mac：Swift 原生外壳 + WKWebView。Windows：C# 外壳，用系统自带的 Chakra 跑同一份 JS 规则和绘图，GDI 分层窗口显示。都不依赖第三方库。

- `web/sim.js`：全部游戏规则，不碰 DOM
- `web/render.js`：画面，并在每团烟出生时算好整条路径
- `web/main.js`：输入、循环、存档
- `native/main.swift`：透明窗口、点击穿透、菜单栏，用 Core Animation 播放烟雾
- `windows/`：Windows 悬浮窗、托盘菜单和绘图桥接，`build.ps1` 构建
- 数据位置：Mac `~/Library/Application Support/EmoKing/state.json`，Windows `%LOCALAPPDATA%\EmoKing\state.json`

烟雾路径由 JS 一次算好，交给 Core Animation 播放，网页不用每帧提交画面。平稳燃烧时循环只有每秒 5 次，没有东西在动时完全停止。

直接用浏览器打开 `web/index.html` 也能调试，烟雾会改用 Canvas 回放同一条路径，但没有悬浮窗和菜单栏。

## 测试

```bash
node --test tests/sim.test.js      # 游戏规则，需要 Node.js 18+
scripts/selftest.sh /tmp/emoking   # 在真实窗口里跑完整流程，并采样 CPU 和内存
```

`selftest.sh` 用单独的测试构建和单独的存档，不影响正式数据。部分检查依赖真实计时，机器很忙时可能偶发失败，建议单独运行。

`scripts/package.sh` 会生成发布用的 `dist/EmoKing-macos.zip`。Windows 包由 GitHub Actions（`.github/workflows/windows.yml`）构建：推到 main 后在 Actions 里下载；发布 Release 时会自动把 `EmoKing-windows.zip` 传到这个 Release。

## 许可证

[MIT](LICENSE)
