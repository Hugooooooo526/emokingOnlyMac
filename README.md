# 吸烟模拟器 EmoKing

一个 Mac 桌面小摆件：在透明悬浮窗里点一支虚拟的烟，看它慢慢烧、冒烟、掉灰。

不联网、不上传、没有声音、不弹通知，数据只有本机一个小 JSON。

<img src="docs/screenshot.png" width="340" alt="烟灰缸、打火机、烟盒和一支正在冒烟的烟">

## 系统要求

**只支持 macOS**，不支持 Windows 和 Linux。

- macOS 13 或更高版本
- Xcode 命令行工具：`xcode-select --install`

目前只在 Apple M5、macOS 27 上实际运行过。构建产物同时包含 Apple 芯片和 Intel 版本，但 Intel 机器和较旧的 macOS 版本还没有实测。

## 安装

暂时没有预编译版本，需要从源码构建：

```bash
git clone <仓库地址> emoking
cd emoking
./build.sh                # 生成 dist/EmoKing.app，约 1 分钟
open dist/EmoKing.app     # 启动
```

想长期使用，把 `dist/EmoKing.app` 拖进“应用程序”文件夹。

App 没有 Dock 图标。启动后窗口出现在屏幕右下角，屏幕顶部菜单栏会多一个烟雾图标。

## 玩法

| 操作 | 效果 |
|---|---|
| 点烟盒 | 拿一支烟 |
| 点打火机 | 点烟，今日计数 +1 |
| 按住烟身或空格 | 吸一口，松手吐烟；按得越久吐得越多，轻点是小口 |
| 点烟头 | 抖灰 |
| 点烟灰缸 | 掐灭；没点过的烟会放回烟盒 |
| 拖烟盒、打火机或烟灰缸 | 挪动窗口 |
| 在物件上右键，或点菜单栏图标 | 隐藏、置顶、窗口大小、烟量、退出 |

- 一支烟放着约 4 分钟烧完，吸的时候烧得更快。
- 60 秒不吸会自动熄灭，之后可以用打火机重新点，或者点烟盒换一支。
- 烟灰太久不抖会自己断。
- 窗口透明的地方鼠标会穿透到下面的窗口，只有物件本身可以点。
- 窗口隐藏后动画和燃烧都会暂停。

## 验收结果

测试环境：Apple M5，macOS 27。

| 指标 | 目标 | 实测 |
|---|---|---|
| 安装包 | <10 MB | 580 KB |
| 启动到可交互 | <1 秒 | 0.64 秒 |
| 抽烟时 CPU | <5% | 3.6%～3.9% |
| 空闲 CPU | 接近 0 | 鼠标不动时线程全部休眠；采样时最高 2.0% |
| 内存 | 空闲约 30 MB | 约 60 MB（刚启动空闲时） |

- CPU 是 App 和 WebKit 子进程的合计，不含系统 WindowServer，烟雾的合成开销在 WindowServer 里，所以实际总开销会更高一点。
- 内存是 App 和 WebKit 子进程的 `footprint` 合计，高于 30 MB 的目标；抽烟时的内存没有单独测量。

## 已知限制

- 点过窗口后，空格和打字都会被它接收，要点一下别的窗口，键盘才会回到原来的 App。
- 刘海屏上菜单栏太满时，图标可能被挤掉。这时要退出 App，只能用活动监视器结束 EmoKing。
- 暂时不支持开机自启。

## 技术实现

Swift 原生外壳 + WKWebView，不依赖第三方库。

- `web/sim.js`：全部游戏规则，不碰 DOM
- `web/render.js`：画面，并在每团烟出生时算好整条路径
- `web/main.js`：输入、循环、存档
- `native/main.swift`：透明窗口、点击穿透、菜单栏，用 Core Animation 播放烟雾
- 数据位置：`~/Library/Application Support/EmoKing/state.json`

烟雾路径由 JS 一次算好，交给 Core Animation 播放，网页不用每帧提交画面。平稳燃烧时循环只有每秒 5 次，没有东西在动时完全停止。

直接用浏览器打开 `web/index.html` 也能调试，烟雾会改用 Canvas 回放同一条路径，但没有悬浮窗和菜单栏。

## 测试

```bash
node --test tests/sim.test.js      # 游戏规则，需要 Node.js 18+
scripts/selftest.sh /tmp/emoking   # 在真实窗口里跑完整流程，并采样 CPU 和内存
```

`selftest.sh` 用单独的测试构建和单独的存档，不影响正式数据。

## 许可证

[MIT](LICENSE)
