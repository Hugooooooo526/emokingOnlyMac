// 只在测试构建里编译（scripts/selftest.sh）。在进程内给窗口发真实事件，走完整链路：
// AppKit 事件 → 本地监听 → WKWebView → JS。结果写到 $EMOKING_OUT。
import Cocoa
import WebKit

extension AppDelegate {
    private var out: String { ProcessInfo.processInfo.environment["EMOKING_OUT"]! }

    private func log(_ s: String) {
        let line = "\(s)\n"
        print(line, terminator: "")
        let url = URL(fileURLWithPath: out + "/log.txt")
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); try? h.close()
        } else { try? line.write(to: url, atomically: true, encoding: .utf8) }
    }

    private func wait(_ s: Double) async { try? await Task.sleep(nanoseconds: UInt64(s * 1e9)) }

    private func js(_ code: String) async -> String {
        await withCheckedContinuation { c in
            webView.evaluateJavaScript(code) { v, e in c.resume(returning: e.map { "ERR \($0)" } ?? "\(v ?? "nil")") }
        }
    }

    private func check(_ name: String, _ ok: Bool, _ detail: String = "") {
        log("\(ok ? "PASS" : "FAIL") \(name) \(detail)")
    }

    private func snap(_ name: String) async {
        let img: NSImage? = await withCheckedContinuation { c in
            webView.takeSnapshot(with: nil) { i, _ in c.resume(returning: i) }
        }
        guard let tiff = img?.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
              let png = rep.representation(using: .png, properties: [:]) else { log("FAIL snapshot \(name)"); return }
        try? png.write(to: URL(fileURLWithPath: "\(out)/\(name).png"))
    }

    // 网页快照 + 把 Core Animation 当前帧的烟叠上去
    private func snapSmoke(_ name: String) async {
        let img: NSImage? = await withCheckedContinuation { c in
            webView.takeSnapshot(with: nil) { i, _ in c.resume(returning: i) }
        }
        guard let base = img, let root = smokeView.layer?.presentation() else { return }
        let size = smokeView.bounds.size
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width * 2), pixelsHigh: Int(size.height * 2),
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        rep.size = size
        let ctx = NSGraphicsContext(bitmapImageRep: rep)!
        NSGraphicsContext.current = ctx
        NSColor(red: 0.23, green: 0.43, blue: 0.65, alpha: 1).setFill()
        NSRect(origin: .zero, size: size).fill()
        base.draw(in: NSRect(origin: .zero, size: size))
        root.render(in: ctx.cgContext)
        ctx.flushGraphics()
        NSGraphicsContext.current = nil
        try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: "\(out)/\(name).png"))
    }

    // 场景坐标 → 窗口坐标
    private func winPoint(_ x: CGFloat, _ y: CGFloat) -> NSPoint {
        let s = panel.frame.width / sceneSize.width
        return NSPoint(x: x * s, y: panel.frame.height - y * s)
    }

    private func post(_ type: NSEvent.EventType, _ p: NSPoint) {
        let screen = NSPoint(x: panel.frame.minX + p.x, y: panel.frame.minY + p.y)
        mouseNow = { screen }
        NSApp.postEvent(NSEvent.mouseEvent(with: type, location: p, modifierFlags: [],
            timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: panel.windowNumber,
            context: nil, eventNumber: 0, clickCount: 1, pressure: 1)!, atStart: false)
    }

    private func click(_ x: CGFloat, _ y: CGFloat, hold: Double = 0.05) async {
        let p = winPoint(x, y)
        post(.leftMouseDown, p)
        await wait(hold)
        post(.leftMouseUp, p)
        await wait(0.1)
    }

    private func key(_ type: NSEvent.EventType) {
        NSApp.postEvent(NSEvent.keyEvent(with: type, location: .zero, modifierFlags: [],
            timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: panel.windowNumber, context: nil,
            characters: " ", charactersIgnoringModifiers: " ", isARepeat: false, keyCode: 49)!, atStart: false)
    }

    private func mark(_ s: String) { try? s.write(toFile: out + "/stage", atomically: true, encoding: .utf8) }

    func runSelfTest() {
        Task { @MainActor in
            let t0 = Double(ProcessInfo.processInfo.environment["EMOKING_T0"] ?? "") ?? 0
            while hits.isEmpty { await wait(0.005) }
            log(String(format: "启动到页面可交互 %.2f 秒", Date().timeIntervalSince1970 - t0))
            check("菜单栏图标存在", statusItem.button?.image != nil)
            await wait(1.0)
            let t = await js("typeof emoking")
            check("页面在 WKWebView 里加载（CSP 没拦脚本）", t == "object", t)
            check("原生层收到可点击区域", hits.count == 3, "\(hits.count)")
            await snap("1-empty")

            // 点击穿透
            let f = panel.frame
            mouseNow = { NSPoint(x: f.minX + 20, y: f.maxY - 20) }; updateHover()
            check("透明处穿透", panel.ignoresMouseEvents)
            mouseNow = { NSPoint(x: f.minX + 274, y: f.maxY - 450) }; updateHover()
            check("烟盒上接收鼠标", !panel.ignoresMouseEvents)

            await click(274, 450); await wait(0.8)
            var ph = await js("emoking.sim.phase")
            check("点烟盒拿烟", ph == "unlit", ph)
            check("点击后窗口拿到键盘焦点", panel.isKeyWindow)
            check("新烟加入可点击区域", hits.count == 4, "\(hits.count)")

            await click(218, 470); await wait(1.2)
            ph = await js("emoking.sim.phase + ' ' + emoking.sim.count")
            check("点打火机点烟并计数", ph == "lit 1", ph)

            let px = await js("emoking.scene.lastPose.x + ' ' + emoking.scene.lastPose.y")
            let tip = px.split(separator: " ").map { CGFloat(Double($0)!) }
            await click(tip[0] + 90, tip[1] + 12, hold: 1.2)
            await snap("2-exhale")
            let burned1 = Double(await js("emoking.sim.burned"))!
            check("按住烟吸一口后烧得更快", burned1 > 0.03, "\(burned1)")

            key(.keyDown); await wait(0.4)
            let puff = await js("emoking.sim.puffing")
            key(.keyUp); await wait(0.2)
            let puff2 = await js("emoking.sim.puffing")
            check("空格按住吸、松开停", puff == "1" && puff2 == "0", "\(puff)/\(puff2)")

            // 拖动：从烟灰缸拖走，不能被当成点击掐灭
            let o = panel.frame.origin
            let start = winPoint(100, 470)
            post(.leftMouseDown, start); await wait(0.05)
            let down = NSPoint(x: o.x + start.x, y: o.y + start.y)
            for i in 1...6 {
                let m = NSPoint(x: down.x - CGFloat(i) * 10, y: down.y + CGFloat(i) * 6)
                mouseNow = { m }
                NSApp.postEvent(NSEvent.mouseEvent(with: .leftMouseDragged, location: start, modifierFlags: [],
                    timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: panel.windowNumber,
                    context: nil, eventNumber: 0, clickCount: 1, pressure: 1)!, atStart: false)
                await wait(0.03)
            }
            post(.leftMouseUp, start); await wait(0.2)
            let moved = NSPoint(x: panel.frame.minX - o.x, y: panel.frame.minY - o.y)
            ph = await js("emoking.sim.phase")
            check("拖动挪窗口", moved.x == -60 && moved.y == 36, "\(moved)")
            check("拖动没有误触掐灭", ph == "lit", ph)

            _ = await js("emoking.sim.ash = 0.15; 0")
            await wait(0.2); await snap("3-ash")
            await click(tip[0] - 6, tip[1])
            let ash = Double(await js("emoking.sim.ash"))!
            check("点烟头抖灰", ash < 0.01, "\(ash)")

            mouseNow = { NSPoint(x: 5, y: 5) }
            updateHover()
            await wait(3)
            let live = smokeView.liveCount
            check("烟雾在原生层播放", live > 10 && live <= 120, "\(live) 团")
            await snapSmoke("6-smoke-native")
            mark("passive"); await wait(13)
            let b0 = Double(await js("emoking.sim.burned"))!
            toggleVisible(); await wait(2)
            let b1 = Double(await js("emoking.sim.burned"))!
            await wait(2)
            let b2 = Double(await js("emoking.sim.burned"))!
            check("隐藏窗口后动画和燃烧都停", b1 == b2, "\(b0) \(b1) \(b2)")
            toggleVisible(); await wait(1)
            let b3 = Double(await js("emoking.sim.burned"))!
            check("再显示后继续烧", b3 > b2, "\(b3)")
            await click(tip[0] + 90, tip[1] + 12)
            mark("lit"); log("stage lit")
            var peak = 0
            for _ in 0..<6 {
                await wait(4); await click(tip[0] + 90, tip[1] + 12, hold: 0.8)
                await wait(0.5); peak = max(peak, smokeView.liveCount)
            }
            check("粒子不超过上限", peak <= 120, "峰值 \(peak)")
            await snapSmoke("7-exhale-native")
            mark("settle")

            await click(100, 470); await wait(1)
            ph = await js("emoking.sim.phase + ' butts=' + emoking.sim.butts")
            check("点烟灰缸掐灭", ph == "empty butts=1", ph)
            await snap("4-stubbed")

            // 换大窗口后坐标是否还对
            let big = NSMenuItem(); big.tag = 2
            pickSize(big); await wait(0.5)
            await click(274, 450); await wait(0.8)
            ph = await js("emoking.sim.phase")
            check("大窗口下点击坐标正确", ph == "unlit", ph + " \(panel.frame.size)")
            await snap("5-large")
            await click(100, 470); await wait(0.7)
            let small = NSMenuItem(); small.tag = 1
            pickSize(small); await wait(0.3)

            mouseNow = { NSPoint(x: 5, y: 5) }
            updateHover()
            await wait(7)
            check("空闲后烟雾层清空", smokeView.liveCount == 0, "\(smokeView.liveCount)")
            let busy = await js("!!emoking.scene.busy()")
            check("空闲后动画循环停止", busy == "0", busy)
            mark("idle"); log("stage idle")
            await wait(16)
            mark("done"); log("done")
            NSApp.terminate(nil)
        }
    }
}
