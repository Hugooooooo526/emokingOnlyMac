// Windows 外壳：透明窗口、拖动、点击穿透、托盘、存档。游戏规则都在 web/ 里。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::{json, Value};
use std::{fs, path::PathBuf, sync::Mutex, thread, time::Duration};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent, Wry,
};

const SCENE_W: f64 = 340.0;
const SCENE_H: f64 = 520.0;
const SIZES: [(&str, f64); 3] = [("小", 0.7), ("中", 1.0), ("大", 1.35)];
const SMOKE: [&str; 3] = ["少", "标准", "多"];
const WINDOW: &str = "main";
const TRAY: &str = "main";

#[derive(Clone, Copy)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

impl Rect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x < self.x + self.w && y >= self.y && y < self.y + self.h
    }
}

struct Shared {
    path: PathBuf,
    data: Value,
    hits: Vec<Rect>,
    button_down: bool,
}

impl Shared {
    fn load(path: PathBuf) -> Self {
        let data = fs::read(&path)
            .ok()
            .and_then(|raw| serde_json::from_slice(&raw).ok())
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({}));
        Self { path, data, hits: vec![], button_down: false }
    }

    fn save(&self) {
        if let Ok(raw) = serde_json::to_vec_pretty(&self.data) {
            let tmp = self.path.with_extension("tmp");
            if fs::write(&tmp, raw).is_ok() {
                let _ = fs::rename(&tmp, &self.path);
            }
        }
    }

    fn index(&self, key: &str, len: usize) -> usize {
        (self.data[key].as_u64().unwrap_or(1) as usize).min(len - 1)
    }

    fn size_index(&self) -> usize {
        self.index("size", SIZES.len())
    }

    fn smoke_level(&self) -> usize {
        self.index("smokeLevel", SMOKE.len())
    }

    fn pinned(&self) -> bool {
        self.data["pinned"].as_bool().unwrap_or(true)
    }

    fn today_count(&self) -> u64 {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        let game = &self.data["game"];
        if game["date"].as_str() == Some(today.as_str()) {
            game["count"].as_u64().unwrap_or(0)
        } else {
            0
        }
    }
}

type State = Mutex<Shared>;

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(WINDOW)
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let (count, pinned, size, smoke) = {
        let s = app.state::<State>();
        let s = s.lock().unwrap();
        (s.today_count(), s.pinned(), s.size_index(), s.smoke_level())
    };
    let visible = window(app).and_then(|w| w.is_visible().ok()).unwrap_or(true);

    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(app, "count", format!("今日 {count} 支"), false, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "toggle", if visible { "隐藏" } else { "显示" }, true, None::<&str>)?)?;
    menu.append(&CheckMenuItem::with_id(app, "pin", "置顶", true, pinned, None::<&str>)?)?;

    let sizes = Submenu::new(app, "窗口大小", true)?;
    for (i, (name, _)) in SIZES.iter().enumerate() {
        sizes.append(&CheckMenuItem::with_id(app, format!("size:{i}"), *name, true, i == size, None::<&str>)?)?;
    }
    menu.append(&sizes)?;

    let levels = Submenu::new(app, "烟量", true)?;
    for (i, name) in SMOKE.iter().enumerate() {
        levels.append(&CheckMenuItem::with_id(app, format!("smoke:{i}"), *name, true, i == smoke, None::<&str>)?)?;
    }
    menu.append(&levels)?;

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?)?;
    Ok(menu)
}

fn refresh_tray(app: &AppHandle) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY), build_menu(app)) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn set_visible(app: &AppHandle, visible: bool) {
    let Some(w) = window(app) else { return };
    if visible {
        let _ = w.show();
    } else {
        let _ = w.hide();
    }
    let _ = w.eval(format!("emoking.setPaused({})", !visible));
    refresh_tray(app);
}

fn set_size(app: &AppHandle, index: usize) {
    let Some(w) = window(app) else { return };
    let scale = SIZES[index].1;
    // 物件都在窗口底部，所以固定左下角缩放
    let old = w.outer_size().ok();
    let _ = w.set_size(LogicalSize::new((SCENE_W * scale).round(), (SCENE_H * scale).round()));
    if let (Some(old), Ok(new), Ok(pos)) = (old, w.outer_size(), w.outer_position()) {
        let y = pos.y + old.height as i32 - new.height as i32;
        let _ = w.set_position(PhysicalPosition::new(pos.x, y));
    }
}

fn on_menu(app: &AppHandle, id: &str) {
    let state = app.state::<State>();
    match id {
        "toggle" => {
            let visible = window(app).and_then(|w| w.is_visible().ok()).unwrap_or(true);
            set_visible(app, !visible);
            return;
        }
        "pin" => {
            let mut s = state.lock().unwrap();
            let pinned = !s.pinned();
            s.data["pinned"] = json!(pinned);
            s.save();
            drop(s);
            if let Some(w) = window(app) {
                let _ = w.set_always_on_top(pinned);
            }
        }
        "quit" => {
            state.lock().unwrap().save();
            app.exit(0);
            return;
        }
        _ => {
            if let Some(i) = id.strip_prefix("size:").and_then(|v| v.parse::<usize>().ok()) {
                {
                    let mut s = state.lock().unwrap();
                    s.data["size"] = json!(i);
                    s.save();
                }
                set_size(app, i);
            } else if let Some(i) = id.strip_prefix("smoke:").and_then(|v| v.parse::<usize>().ok()) {
                {
                    let mut s = state.lock().unwrap();
                    s.data["smokeLevel"] = json!(i);
                    s.save();
                }
                if let Some(w) = window(app) {
                    let _ = w.eval(format!("emoking.setSmokeLevel({i})"));
                }
            } else {
                return;
            }
        }
    }
    refresh_tray(app);
}

/// 网页发来的所有消息，格式和 Mac 外壳一样
#[tauri::command]
fn native(app: AppHandle, msg: Value) {
    let state = app.state::<State>();
    match msg["cmd"].as_str() {
        Some("save") => {
            {
                let mut s = state.lock().unwrap();
                s.data["game"] = msg["data"].clone();
                s.save();
            }
            refresh_tray(&app);
        }
        Some("hit") => {
            let n = |r: &Value, k: &str| r[k].as_f64().unwrap_or(0.0);
            let hits = msg["rects"].as_array().map(|rects| {
                rects
                    .iter()
                    .map(|r| Rect { x: n(r, "x"), y: n(r, "y"), w: n(r, "w"), h: n(r, "h") })
                    .collect()
            });
            state.lock().unwrap().hits = hits.unwrap_or_default();
        }
        Some("press") => {
            state.lock().unwrap().button_down = msg["down"].as_bool().unwrap_or(false);
        }
        Some("drag") => {
            // 系统接管拖动后网页收不到松开事件
            state.lock().unwrap().button_down = false;
            if let Some(w) = window(&app) {
                let _ = w.start_dragging();
            }
        }
        Some("menu") => {
            if let (Some(w), Ok(menu)) = (window(&app), build_menu(&app)) {
                let _ = w.popup_menu(&menu);
            }
        }
        _ => {}
    }
}

/// 透明处穿透、物件上接收。窗口穿透时收不到鼠标事件，所以只能轮询光标位置。
fn watch_cursor(app: AppHandle, w: WebviewWindow) {
    thread::spawn(move || {
        let mut ignoring = true;
        loop {
            thread::sleep(Duration::from_millis(50));
            let (hits, down) = {
                let s = app.state::<State>();
                let s = s.lock().unwrap();
                (s.hits.clone(), s.button_down)
            };
            if down || !w.is_visible().unwrap_or(false) {
                continue;
            }
            let (Ok(cursor), Ok(pos), Ok(size)) = (w.cursor_position(), w.outer_position(), w.inner_size()) else {
                continue;
            };
            let scale = size.width as f64 / SCENE_W;
            let x = (cursor.x - pos.x as f64) / scale;
            let y = (cursor.y - pos.y as f64) / scale;
            let inside = hits.iter().any(|r| r.contains(x, y));
            if inside == ignoring {
                ignoring = !inside;
                let _ = w.set_ignore_cursor_events(ignoring);
            }
        }
    });
}

fn start_position(app: &AppHandle, w: &WebviewWindow) {
    let saved = {
        let s = app.state::<State>();
        let s = s.lock().unwrap();
        s.data["x"].as_i64().zip(s.data["y"].as_i64())
    };
    let monitors = w.available_monitors().unwrap_or_default();
    let on_screen = |x: i64, y: i64| {
        monitors.iter().any(|m| {
            let (p, s) = (m.position(), m.size());
            x >= p.x as i64 - 60
                && x < p.x as i64 + s.width as i64 - 60
                && y >= p.y as i64 - 60
                && y < p.y as i64 + s.height as i64 - 60
        })
    };
    // 外接屏拔掉后不能让窗口留在看不见的地方
    if let Some((x, y)) = saved.filter(|(x, y)| on_screen(*x, *y)) {
        let _ = w.set_position(PhysicalPosition::new(x as i32, y as i32));
    } else if let (Ok(Some(m)), Ok(size)) = (w.primary_monitor(), w.outer_size()) {
        // 右下角，留出任务栏的高度
        let margin = (64.0 * m.scale_factor()) as i32;
        let x = m.position().x + m.size().width as i32 - size.width as i32 - margin;
        let y = m.position().y + m.size().height as i32 - size.height as i32 - margin;
        let _ = w.set_position(PhysicalPosition::new(x, y));
    }
}

fn setup(app: &AppHandle) -> tauri::Result<()> {
    let dir = app.path().app_data_dir()?;
    let _ = fs::create_dir_all(&dir);
    app.manage::<State>(Mutex::new(Shared::load(dir.join("state.json"))));

    let (boot, size, pinned) = {
        let s = app.state::<State>();
        let s = s.lock().unwrap();
        let game = if s.data["game"].is_object() { s.data["game"].clone() } else { json!({}) };
        (json!({ "game": game, "smokeLevel": s.smoke_level() }), SIZES[s.size_index()].1, s.pinned())
    };

    let w = WebviewWindowBuilder::new(app, WINDOW, WebviewUrl::App("index.html".into()))
        .title("吸烟模拟器")
        .inner_size((SCENE_W * size).round(), (SCENE_H * size).round())
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .always_on_top(pinned)
        .focused(false)
        .initialization_script(format!("window.__EMOKING_BOOT = {boot};"))
        .build()?;

    start_position(app, &w);
    let _ = w.set_ignore_cursor_events(true);

    let handle = app.clone();
    w.on_window_event(move |event| {
        if let WindowEvent::Moved(p) = event {
            let s = handle.state::<State>();
            let mut s = s.lock().unwrap();
            s.data["x"] = json!(p.x);
            s.data["y"] = json!(p.y);
        }
    });

    let mut tray = TrayIconBuilder::with_id(TRAY)
        .tooltip("吸烟模拟器")
        .menu(&build_menu(app)?);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;

    watch_cursor(app.clone(), w);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| set_visible(app, true)))
        .invoke_handler(tauri::generate_handler![native])
        .on_menu_event(|app, event| on_menu(app, event.id().as_ref()))
        .setup(|app| Ok(setup(app.handle())?))
        .run(tauri::generate_context!())
        .expect("启动失败");
}
