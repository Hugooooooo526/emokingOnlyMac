// 原生外壳：透明悬浮窗、拖动、点击穿透、菜单栏、存档。游戏规则都在 web/ 里。
import Cocoa
import WebKit

let sceneSize = NSSize(width: 340, height: 520)
let sizeOptions: [(title: String, scale: CGFloat)] = [("小", 0.7), ("中", 1.0), ("大", 1.35)]
let smokeOptions = ["少", "标准", "多"]

final class Panel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class SceneView: WKWebView {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// 烟雾层：每团烟是一个 CALayer，路径由 JS 算好，这里交给 Core Animation 播放。
/// 播放不占 App 的 CPU，也不用让网页每帧提交画面。
final class SmokeView: NSView {
    private var sprites: [CGImage] = []
    private var pool: [CALayer] = []

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
    }
    required init?(coder: NSCoder) { fatalError() }

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    func loadSprites(_ urls: [String]) {
        sprites = urls.compactMap { url in
            guard let comma = url.firstIndex(of: ","),
                  let data = Data(base64Encoded: String(url[url.index(after: comma)...])),
                  let src = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
            return CGImageSourceCreateImageAtIndex(src, 0, nil)
        }
    }

    private(set) var liveCount = 0

    /// 一批烟共用一次提交；播完的图层留在树上（透明）等下次复用
    func spawn(_ items: [[String: Any]]) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        items.forEach(spawnOne)
        CATransaction.commit()
    }

    private func spawnOne(_ item: [String: Any]) {
        guard let root = layer, !sprites.isEmpty,
              let keys = (item["keys"] as? [NSNumber])?.map({ CGFloat($0.doubleValue) }),
              keys.count >= 8, keys.count % 4 == 0 else { return }
        let num = { (k: String) in (item[k] as? NSNumber)?.doubleValue ?? 0 }
        let life = num("life"), rot = num("rot"), spin = num("spin")
        let sprite = sprites[Int(num("spr")) % sprites.count]
        let s = bounds.width / sceneSize.width
        let side = CGFloat(sprite.width)
        let count = keys.count / 4

        let positions = (0..<count).map { NSValue(point: NSPoint(x: keys[$0 * 4] * s, y: bounds.height - keys[$0 * 4 + 1] * s)) }
        let scales = (0..<count).map { keys[$0 * 4 + 2] * 2 * s / side }
        let alphas = (0..<count).map { keys[$0 * 4 + 3] }

        let move = CAKeyframeAnimation(keyPath: "position")
        move.values = positions
        move.calculationMode = .cubic
        let grow = CAKeyframeAnimation(keyPath: "transform.scale")
        grow.values = scales
        let fade = CAKeyframeAnimation(keyPath: "opacity")
        fade.values = alphas
        let turn = CABasicAnimation(keyPath: "transform.rotation.z")
        turn.fromValue = rot
        turn.toValue = rot + spin * life

        let group = CAAnimationGroup()
        group.animations = [move, grow, fade, turn]
        group.duration = life
        group.beginTime = CACurrentMediaTime() + num("delay")

        let puff: CALayer
        if let reused = pool.popLast() {
            puff = reused
        } else {
            puff = CALayer()
            puff.opacity = 0
            root.addSublayer(puff)
        }
        puff.contents = sprite
        puff.bounds = CGRect(x: 0, y: 0, width: side, height: side)
        group.delegate = PuffEnd { [weak self] in
            self?.liveCount -= 1
            self?.pool.append(puff)
        }
        liveCount += 1
        puff.add(group, forKey: "puff")
    }
}

final class PuffEnd: NSObject, CAAnimationDelegate {
    private let done: () -> Void
    init(_ done: @escaping () -> Void) { self.done = done }
    func animationDidStop(_ anim: CAAnimation, finished: Bool) { done() }
}

struct Hit {
    let rect: NSRect   // 场景坐标，左上角为原点
    let draggable: Bool
}

/// 全部数据就这一个小 JSON，只存在本机。
final class Store {
    private let url: URL
    var data: [String: Any] = [:]

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var dir = base.appendingPathComponent("EmoKing", isDirectory: true)
        #if EMOKING_TEST
        dir = URL(fileURLWithPath: ProcessInfo.processInfo.environment["EMOKING_OUT"]!)
        #endif
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        url = dir.appendingPathComponent("state.json")
        if let raw = try? Data(contentsOf: url),
           let parsed = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] {
            data = parsed
        }
    }

    func save() {
        guard let raw = try? JSONSerialization.data(withJSONObject: data, options: [.prettyPrinted, .sortedKeys]) else { return }
        try? raw.write(to: url, options: .atomic)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, NSMenuDelegate {
    let store = Store()
    var panel: Panel!
    var webView: SceneView!
    var smokeView: SmokeView!
    var mouseNow: () -> NSPoint = { NSEvent.mouseLocation }
    var statusItem: NSStatusItem!
    private let menu = NSMenu()

    var hits: [Hit] = []
    private var hoverTimer: Timer?
    private var buttonDown = false
    private var dragArmed = false
    private var dragging = false
    private var dragMouseStart = NSPoint.zero
    private var dragOriginStart = NSPoint.zero
    private var monitors: [Any] = []

    private var sizeIndex: Int {
        get { min(max(store.data["size"] as? Int ?? 1, 0), sizeOptions.count - 1) }
        set { store.data["size"] = newValue }
    }
    private var smokeLevel: Int {
        get { min(max(store.data["smokeLevel"] as? Int ?? 1, 0), smokeOptions.count - 1) }
        set { store.data["smokeLevel"] = newValue }
    }
    private var pinned: Bool {
        get { store.data["pinned"] as? Bool ?? true }
        set { store.data["pinned"] = newValue }
    }
    private var scale: CGFloat { panel.frame.width / sceneSize.width }

    func applicationDidFinishLaunching(_ note: Notification) {
        let id = Bundle.main.bundleIdentifier ?? ""
        if NSRunningApplication.runningApplications(withBundleIdentifier: id).count > 1 {
            NSApp.terminate(nil)
            return
        }
        buildPanel()
        buildWebView()
        buildStatusItem()
        installMonitors()
        NotificationCenter.default.addObserver(
            self, selector: #selector(occlusionChanged),
            name: NSWindow.didChangeOcclusionStateNotification, object: panel)
        panel.orderFrontRegardless()
        #if EMOKING_TEST
        runSelfTest()
        #endif
    }

    // MARK: 窗口

    private func windowSize() -> NSSize {
        let s = sizeOptions[sizeIndex].scale
        return NSSize(width: (sceneSize.width * s).rounded(), height: (sceneSize.height * s).rounded())
    }

    private func buildPanel() {
        let size = windowSize()
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        var origin = NSPoint(x: screen.maxX - size.width - 40, y: screen.minY + 40)
        if let x = store.data["x"] as? Double, let y = store.data["y"] as? Double {
            let saved = NSRect(origin: NSPoint(x: x, y: y), size: size)
            // 外接屏拔掉后不能让窗口留在看不见的地方
            if NSScreen.screens.contains(where: { $0.visibleFrame.intersects(saved.insetBy(dx: 60, dy: 60)) }) {
                origin = saved.origin
            }
        }
        panel = Panel(contentRect: NSRect(origin: origin, size: size),
                      styleMask: [.borderless, .nonactivatingPanel],
                      backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isMovable = false
        panel.acceptsMouseMovedEvents = true
        panel.ignoresMouseEvents = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        applyPinned()
    }

    private func applyPinned() {
        panel.level = pinned ? .floating : .normal
    }

    private func buildWebView() {
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "native")
        let boot: [String: Any] = ["game": store.data["game"] ?? [String: Any](), "smokeLevel": smokeLevel]
        if let raw = try? JSONSerialization.data(withJSONObject: boot),
           let json = String(data: raw, encoding: .utf8) {
            config.userContentController.addUserScript(WKUserScript(
                source: "window.__EMOKING_BOOT = \(json);",
                injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        webView = SceneView(frame: NSRect(origin: .zero, size: panel.frame.size), configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .clear
        webView.allowsMagnification = false
        webView.allowsBackForwardNavigationGestures = false
        let container = NSView(frame: webView.frame)
        container.autoresizesSubviews = true
        smokeView = SmokeView(frame: webView.frame)
        smokeView.autoresizingMask = [.width, .height]
        container.addSubview(webView)
        container.addSubview(smokeView)
        panel.contentView = container
        panel.makeFirstResponder(webView)

        let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
        webView.loadFileURL(root.appendingPathComponent("index.html"), allowingReadAccessTo: root)
    }

    @objc private func occlusionChanged() {
        let visible = panel.occlusionState.contains(.visible)
        webView.evaluateJavaScript("window.emoking && emoking.setPaused(\(!visible))")
    }

    // MARK: JS 消息

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "save":
            store.data["game"] = body["data"]
            store.save()
        case "sprites":
            smokeView.loadSprites(body["urls"] as? [String] ?? [])
        case "smoke":
            smokeView.spawn(body["items"] as? [[String: Any]] ?? [])
        case "hit":
            let rects = body["rects"] as? [[String: Any]] ?? []
            hits = rects.map { r in
                let n = { (k: String) in CGFloat((r[k] as? NSNumber)?.doubleValue ?? 0) }
                return Hit(rect: NSRect(x: n("x"), y: n("y"), width: n("w"), height: n("h")),
                           draggable: r["drag"] as? Bool ?? false)
            }
            updateHover()
        default:
            break
        }
    }

    // MARK: 鼠标：透明处穿透，物件上才接收

    func hit(at p: NSPoint) -> Hit? {
        let f = panel.frame
        let local = NSPoint(x: (p.x - f.minX) / scale, y: (f.maxY - p.y) / scale)
        return hits.last { $0.rect.contains(local) }
    }

    func updateHover() {
        guard !buttonDown else { return }
        let inside = panel.isVisible && hit(at: mouseNow()) != nil
        if panel.ignoresMouseEvents == inside { panel.ignoresMouseEvents = !inside }
        if inside && hoverTimer == nil {
            // 鼠标在物件上时才轮询，离开后立刻停，保证空闲时零开销
            hoverTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                self?.updateHover()
            }
        } else if !inside {
            hoverTimer?.invalidate()
            hoverTimer = nil
        }
    }

    private func installMonitors() {
        let global = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved, .leftMouseUp]) { [weak self] _ in
            self?.updateHover()
        }
        if let global { monitors.append(global) }

        let local = NSEvent.addLocalMonitorForEvents(
            matching: [.mouseMoved, .leftMouseDown, .leftMouseDragged, .leftMouseUp, .rightMouseDown]
        ) { [weak self] event in
            self?.handleLocal(event) ?? event
        }
        if let local { monitors.append(local) }
    }

    private func handleLocal(_ event: NSEvent) -> NSEvent? {
        guard event.window === panel else {
            if event.type == .mouseMoved { updateHover() }
            return event
        }
        let mouse = mouseNow()
        switch event.type {
        case .mouseMoved:
            updateHover()
        case .leftMouseDown:
            buttonDown = true
            dragArmed = hit(at: mouse)?.draggable ?? false
            dragging = false
            dragMouseStart = mouse
            dragOriginStart = panel.frame.origin
        case .leftMouseDragged:
            guard dragArmed else { break }
            let dx = mouse.x - dragMouseStart.x, dy = mouse.y - dragMouseStart.y
            if !dragging && hypot(dx, dy) > 4 {
                dragging = true
                webView.evaluateJavaScript("emoking.cancelPress()")
            }
            if dragging {
                panel.setFrameOrigin(NSPoint(x: dragOriginStart.x + dx, y: dragOriginStart.y + dy))
                return nil
            }
        case .leftMouseUp:
            buttonDown = false
            let wasDragging = dragging
            dragArmed = false
            dragging = false
            if wasDragging {
                savePosition()
                updateHover()
            } else {
                DispatchQueue.main.async { self.updateHover() }
            }
        case .rightMouseDown:
            menu.popUp(positioning: nil, at: mouse, in: nil)
            return nil
        default:
            break
        }
        return event
    }

    private func savePosition() {
        store.data["x"] = panel.frame.origin.x
        store.data["y"] = panel.frame.origin.y
        store.save()
    }

    // MARK: 菜单栏

    private func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let image = NSImage(systemSymbolName: "smoke.fill", accessibilityDescription: "吸烟模拟器")
        image?.isTemplate = true
        statusItem.button?.image = image
        menu.delegate = self
        menu.autoenablesItems = false
        statusItem.menu = menu
        menuNeedsUpdate(menu)
    }

    private func todayCount() -> Int {
        guard let game = store.data["game"] as? [String: Any],
              game["date"] as? String == dayKey() else { return 0 }
        return game["count"] as? Int ?? 0
    }

    private func dayKey() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    private func item(_ title: String, _ action: Selector?, tag: Int = 0, on: Bool = false) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: action, keyEquivalent: "")
        i.target = self
        i.tag = tag
        i.state = on ? .on : .off
        return i
    }

    private func submenu(_ title: String, _ options: [String], selected: Int, _ action: Selector) -> NSMenuItem {
        let parent = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        let sub = NSMenu()
        for (i, name) in options.enumerated() {
            sub.addItem(item(name, action, tag: i, on: i == selected))
        }
        parent.submenu = sub
        return parent
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let count = item("今日 \(todayCount()) 支", nil)
        count.isEnabled = false
        menu.addItem(count)
        menu.addItem(.separator())
        menu.addItem(item(panel.isVisible ? "隐藏" : "显示", #selector(toggleVisible)))
        menu.addItem(item("置顶", #selector(togglePinned), on: pinned))
        menu.addItem(submenu("窗口大小", sizeOptions.map(\.title), selected: sizeIndex, #selector(pickSize)))
        menu.addItem(submenu("烟量", smokeOptions, selected: smokeLevel, #selector(pickSmoke)))
        menu.addItem(.separator())
        menu.addItem(item("退出", #selector(quit)))
    }

    @objc func toggleVisible() {
        if panel.isVisible {
            panel.orderOut(nil)
            webView.evaluateJavaScript("emoking.setPaused(true)")
        } else {
            panel.orderFrontRegardless()
            webView.evaluateJavaScript("emoking.setPaused(false)")
        }
        updateHover()
    }

    @objc private func togglePinned() {
        pinned.toggle()
        applyPinned()
        store.save()
    }

    @objc func pickSize(_ sender: NSMenuItem) {
        sizeIndex = sender.tag
        // 物件都在窗口底部，所以固定左下角缩放
        panel.setFrame(NSRect(origin: panel.frame.origin, size: windowSize()), display: true)
        store.save()
        updateHover()
    }

    @objc private func pickSmoke(_ sender: NSMenuItem) {
        smokeLevel = sender.tag
        webView.evaluateJavaScript("emoking.setSmokeLevel(\(sender.tag))")
        store.save()
    }

    @objc private func quit() { NSApp.terminate(nil) }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
