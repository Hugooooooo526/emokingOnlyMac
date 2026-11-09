# Windows 版（未测试）

这个分支用 Tauri 2 给 EmoKing 写了 Windows 外壳，游戏规则和画面和 Mac 版共用 `web/`。

**`.exe` 还没有在 Windows 上运行过。** 代码只做过编译检查，可能有问题。

## 获取 .exe

需要 Windows 10 或 11，以及 WebView2 运行库（Windows 11 自带，Windows 10 大多已经装好）。

**方式一：GitHub Actions。** 把 `windows` 分支推到 GitHub 后，`Windows build` 会自动运行。完成后在这次运行页面底部的 Artifacts 里下载 `EmoKing-windows`，里面是 `emoking.exe`，双击就能用，不需要安装。

**方式二：在 Windows 上构建。** 安装 [Rust](https://rustup.rs) 和 Visual Studio 的 C++ 生成工具，然后运行：

```bash
cd src-tauri
cargo build --release     # 生成 target/release/emoking.exe
```

## 和 Mac 版的区别

- 玩法相同，控制入口在屏幕右下角的系统托盘图标，托盘可能收在“^”里。
- 烟雾用 Canvas 绘制，没有做性能优化，CPU 占用会比 Mac 版高，README 里的验收数据不适用。
- 点击窗口时它会拿走焦点。
- 数据存在 `%APPDATA%\local.emoking.smoke\state.json`。
