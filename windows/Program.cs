using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
#if SELF_TEST
        if (args.Length == 2 && args[0] == "--self-test") { SelfTest.Run(args[1]); return; }
#endif
        using (System.Threading.Mutex instance = new System.Threading.Mutex(false, @"Local\EmoKing.Windows.1"))
        {
            bool own;
            try { own = instance.WaitOne(0); }
            catch (System.Threading.AbandonedMutexException) { own = true; }
            if (!own) { LayeredWindow.RequestShow(); return; }
            try
            {
                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.ThrowException);
                using (Desktop app = new Desktop(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "EmoKing")))
                    Application.Run(app);
            }
            catch (Exception error)
            {
                MessageBox.Show("EmoKing 运行失败。\n\n" + error.Message, "EmoKing", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally { instance.ReleaseMutex(); }
        }
    }
}

sealed partial class Desktop : ApplicationContext
{
    static readonly float[] Sizes = { 0.7f, 1f, 1.35f };
    static readonly string[] CigaretteStyles = { "绿拉 · Lucky Strike", "七星 · Seven Stars", "柔和七星 · 经典蓝", "万宝路 · 红标", "骆驼 · 经典" };
    static readonly string[] LighterStyles = { "拉丝银", "复古黄铜", "哑光黑", "糖果红" };
    readonly CanvasSet canvases = new CanvasSet();
    readonly LayeredWindow window = new LayeredWindow();
    readonly InputWindow input = new InputWindow();
    readonly Timer timer = new Timer { Interval = 33 };
    readonly ContextMenuStrip menu = new ContextMenuStrip();
    readonly NotifyIcon tray = new NotifyIcon();
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    readonly Stopwatch elapsed = new Stopwatch();
    readonly JsHost engine;
    readonly string statePath;
    readonly Icon icon;
    readonly Dictionary<string, object> state;
    readonly float dpi;
    readonly ToolStripMenuItem countItem, visibleItem, pinItem, sizeItem, smokeItem, cigaretteItem, lighterItem;
    List<Hit> hits = new List<Hit>();
    string hint = "", pressed = "";
    bool dragging, spaceDown;
    Point dragStart, origin;
    int count, sizeIndex, smokeLevel, cigaretteStyle, lighterStyle;
    bool pinned, shown;

    public Desktop(string directory)
    {
        statePath = Path.Combine(directory, "state.json");
        state = LoadState();
        sizeIndex = Option("size", 1, Sizes.Length);
        smokeLevel = Option("smokeLevel", 1, 3);
        cigaretteStyle = Option("cigaretteStyle", 0, CigaretteStyles.Length);
        lighterStyle = Option("lighterStyle", 0, LighterStyles.Length);
        object value;
        pinned = !state.TryGetValue("pinned", out value) || !(value is bool) || (bool)value;
        using (Graphics display = Graphics.FromHwnd(IntPtr.Zero)) dpi = display.DpiX / 96;

        window.ShowRequested += ShowWindow;
        input.Owner = window;
        input.MouseDown += MouseDown;
        input.MouseMove += MouseMove;
        input.MouseUp += MouseUp;
        input.MouseCaptureChanged += delegate { if (!input.Capture) CancelPress(); };
        input.KeyDown += KeyDown;
        input.KeyUp += KeyUp;
        input.Deactivate += delegate { CancelPress(); };
        timer.Tick += delegate { Advance(); };

        countItem = new ToolStripMenuItem { Enabled = false };
        visibleItem = new ToolStripMenuItem("隐藏", null, delegate { ToggleWindow(); });
        pinItem = new ToolStripMenuItem("置顶", null, delegate { pinned = !pinned; ApplyPin(); Save(); });
        sizeItem = Choices("窗口大小", new[] { "小", "中", "大" }, SelectSize);
        smokeItem = Choices("烟量", new[] { "少", "标准", "多" }, SelectSmoke);
        cigaretteItem = Choices("香烟款式", CigaretteStyles, index => { cigaretteStyle = index; ApplyStyles(); Save(); });
        lighterItem = Choices("Zippo 款式", LighterStyles, index => { lighterStyle = index; ApplyStyles(); Save(); });
        menu.Items.AddRange(new ToolStripItem[] { countItem, new ToolStripSeparator(), visibleItem, pinItem,
            sizeItem, smokeItem, new ToolStripSeparator(), cigaretteItem, lighterItem,
            new ToolStripSeparator(), new ToolStripMenuItem("退出", null, delegate { ExitThread(); }) });
        menu.Opening += delegate { UpdateMenu(); };
        icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
        tray.Icon = icon;
        tray.Text = "EmoKing 吸烟模拟器";
        tray.ContextMenuStrip = menu;
        tray.MouseClick += delegate(object sender, MouseEventArgs e) { if (e.Button == MouseButtons.Left) ShowWindow(); };

        engine = new JsHost(Dispatch);
        try
        {
            foreach (string name in new[] { "canvas.js", "sim.js", "render.js", "desktop.js" })
            {
                using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
                using (StreamReader reader = new StreamReader(stream, Encoding.UTF8)) engine.Run(reader.ReadToEnd(), name);
            }
            engine.Bind();
            ApplyPin();
            PlaceWindow();
            ApplyStyles();
            Execute("size", window.Width);
            Execute("smoke", smokeLevel);
            ShowWindow();
            tray.Visible = true;
        }
        catch { Dispose(); throw; }
    }

    IntPtr Dispatch(JsHost.Args args)
    {
        switch (args.I(0))
        {
            case 50:
                object saved;
                return JsHost.Str(state.TryGetValue("game", out saved) && saved is Dictionary<string, object> ? json.Serialize(saved) : "{}");
            case 51: state["game"] = json.DeserializeObject(args.S(1)); Save(); break;
            case 52: hits = json.Deserialize<List<Hit>>(args.S(1)); UpdateInputRegion(); break;
            case 53: hint = args.S(1); count = args.I(2); break;
            default: return canvases.Dispatch(args);
        }
        return IntPtr.Zero;
    }

    Dictionary<string, object> LoadState()
    {
        try { return json.Deserialize<Dictionary<string, object>>(File.ReadAllText(statePath)) ?? new Dictionary<string, object>(); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
        catch (ArgumentException) { }
        catch (InvalidOperationException) { }
        return new Dictionary<string, object>();
    }

    int ReadInt(string key, int fallback)
    {
        object value;
        return state.TryGetValue(key, out value) && value is int ? (int)value : fallback;
    }

    int Option(string key, int fallback, int count)
    {
        int value = ReadInt(key, fallback);
        return value >= 0 && value < count ? value : fallback;
    }

    void Save()
    {
        state["size"] = sizeIndex;
        state["smokeLevel"] = smokeLevel;
        state["pinned"] = pinned;
        state["cigaretteStyle"] = cigaretteStyle;
        state["lighterStyle"] = lighterStyle;
        string pending = statePath + ".tmp";
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(statePath));
            File.WriteAllText(pending, json.Serialize(state), new UTF8Encoding(false));
            if (File.Exists(statePath)) File.Replace(pending, statePath, null);
            else File.Move(pending, statePath);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    float Scale { get { return window.Width / 340f; } }
    Size SceneSize { get { return new Size((int)Math.Round(340 * Sizes[sizeIndex] * dpi), (int)Math.Round(520 * Sizes[sizeIndex] * dpi)); } }

    void PlaceWindow()
    {
        Size size = SceneSize;
        Rectangle area = Screen.PrimaryScreen.WorkingArea;
        Point fallback = new Point(area.Right - size.Width - 40, area.Bottom - size.Height - 40);
        Rectangle saved = new Rectangle(new Point(ReadInt("x", fallback.X), ReadInt("y", fallback.Y)), size);
        Rectangle visibleObjects = new Rectangle(saved.X + size.Width / 8, saved.Y + size.Height * 3 / 4,
            size.Width * 3 / 4, size.Height / 4);
        foreach (Screen screen in Screen.AllScreens)
        {
            Rectangle visible = Rectangle.Intersect(screen.WorkingArea, visibleObjects);
            if (visible.Width >= 60 && visible.Height >= 45) { SetBounds(saved); return; }
        }
        SetBounds(new Rectangle(fallback, size));
    }

    void SetBounds(Rectangle bounds) { window.Bounds = bounds; input.Bounds = bounds; }

    void UpdateInputRegion()
    {
        using (Region region = new Region())
        {
            region.MakeEmpty();
            float s = Scale;
            foreach (Hit hit in hits)
                region.Union(Rectangle.FromLTRB((int)Math.Floor(hit.x * s), (int)Math.Floor(hit.y * s),
                    (int)Math.Ceiling((hit.x + hit.w) * s), (int)Math.Ceiling((hit.y + hit.h) * s)));
            Region previous = input.Region;
            input.Region = region.Clone();
            if (previous != null) previous.Dispose();
        }
    }

    void Paint(Graphics g)
    {
        for (int i = 0; i < 3; i++) g.DrawImageUnscaled(canvases.Image(i), 0, 0);
        float s = Scale;
        g.ScaleTransform(s, s);
        if (hint.Length > 0) Badge(g, hint, 369, 13);
        Badge(g, "今日 " + count.ToString(CultureInfo.InvariantCulture) + " 支", 501, 11);
        g.ResetTransform();
    }

    static void Badge(Graphics g, string text, float y, float size)
    {
        using (Font font = new Font("Microsoft YaHei UI", size, FontStyle.Regular, GraphicsUnit.Pixel))
        using (GraphicsPath path = new GraphicsPath())
        using (Brush background = new SolidBrush(Color.FromArgb(184, 20, 20, 24)))
        {
            float w = g.MeasureString(text, font).Width + 15, h = size + 5, x = (340 - w) / 2;
            path.AddArc(x, y, h, h, 90, 180);
            path.AddArc(x + w - h, y, h, h, 270, 180);
            path.CloseFigure();
            g.FillPath(background, path);
            CanvasSet.Text(g, text, 170, y + size + 1, size, Color.White, false);
        }
    }

    void Advance()
    {
        double seconds = Math.Min(0.25, elapsed.Elapsed.TotalSeconds);
        elapsed.Restart();
        Execute("tick", seconds);
    }

    void Execute(string action, double x = 0, double y = 0)
    {
        bool busy = JsHost.Number(engine.Call(action, x, y)) != 0;
        if (shown) window.Draw(Paint);
        if (shown && busy && !timer.Enabled) { elapsed.Restart(); timer.Start(); }
        else if (!shown || !busy) timer.Stop();
    }

    void ShowWindow()
    {
        if (shown) return;
        engine.Call("count");
        shown = true;
        window.Show();
        input.Show();
        Execute("draw");
    }

    void ToggleWindow()
    {
        if (!shown) { ShowWindow(); return; }
        shown = false;
        CancelPress();
        timer.Stop();
        input.Hide();
        window.Hide();
    }

    void ApplyPin() { window.TopMost = pinned; input.TopMost = pinned; }

    void SelectSize(int index)
    {
        if (sizeIndex == index) return;
        Rectangle bounds = window.Bounds;
        sizeIndex = index;
        Size size = SceneSize;
        Rectangle area = Screen.FromRectangle(bounds).WorkingArea;
        int x = Math.Max(area.Left, Math.Min(bounds.Left, area.Right - size.Width));
        int y = Math.Max(area.Top, Math.Min(bounds.Bottom, area.Bottom) - size.Height);
        SetBounds(new Rectangle(new Point(x, y), size));
        Execute("size", size.Width);
        UpdateInputRegion();
        SavePosition();
    }

    void SelectSmoke(int index) { smokeLevel = index; Execute("smoke", index); Save(); }
    void ApplyStyles() { Execute("style", cigaretteStyle, lighterStyle); }

    void SavePosition() { state["x"] = window.Left; state["y"] = window.Top; Save(); }

    void UpdateMenu()
    {
        countItem.Text = "今日 " + JsHost.Number(engine.Call("count")) + " 支";
        visibleItem.Text = shown ? "隐藏" : "显示";
        pinItem.Checked = pinned;
        CheckChoice(sizeItem, sizeIndex);
        CheckChoice(smokeItem, smokeLevel);
        CheckChoice(cigaretteItem, cigaretteStyle);
        CheckChoice(lighterItem, lighterStyle);
    }

    static void CheckChoice(ToolStripMenuItem item, int index)
    {
        for (int i = 0; i < item.DropDownItems.Count; i++)
            ((ToolStripMenuItem)item.DropDownItems[i]).Checked = i == index;
    }

    static ToolStripMenuItem Choices(string title, string[] labels, Action<int> select)
    {
        ToolStripMenuItem item = new ToolStripMenuItem(title);
        for (int i = 0; i < labels.Length; i++)
        {
            int index = i;
            item.DropDownItems.Add(new ToolStripMenuItem(labels[i], null, delegate { select(index); }));
        }
        return item;
    }

    string HitAt(Point p) { return JsHost.Text(engine.Call("hit", p.X, p.Y)); }

    void MouseDown(object sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Right) { menu.Show(Cursor.Position); return; }
        if (e.Button != MouseButtons.Left) return;
        pressed = HitAt(e.Location);
        if (pressed.Length == 0) return;
        dragStart = Cursor.Position;
        origin = window.Location;
        input.Capture = true;
        if (pressed == "cig" && !spaceDown) Execute("press");
    }

    void MouseMove(object sender, MouseEventArgs e)
    {
        if (pressed != "pack" && pressed != "lighter" && pressed != "tray") return;
        Point mouse = Cursor.Position;
        int dx = mouse.X - dragStart.X, dy = mouse.Y - dragStart.Y;
        if (!dragging && dx * dx + dy * dy <= 16 * dpi * dpi) return;
        dragging = true;
        SetBounds(new Rectangle(origin.X + dx, origin.Y + dy, window.Width, window.Height));
    }

    void MouseUp(object sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left || pressed.Length == 0) return;
        string item = pressed;
        pressed = "";
        bool wasDragging = dragging;
        dragging = false;
        input.Capture = false;
        if (wasDragging) SavePosition();
        else if (item == "cig") { if (!spaceDown) Execute("release"); }
        else if (HitAt(e.Location) == item) Execute(item);
    }

    void KeyDown(object sender, KeyEventArgs e)
    {
        if (e.KeyCode != Keys.Space) return;
        e.SuppressKeyPress = true;
        if (spaceDown) return;
        spaceDown = true;
        if (pressed != "cig") Execute("press");
    }

    void KeyUp(object sender, KeyEventArgs e)
    {
        if (e.KeyCode != Keys.Space || !spaceDown) return;
        spaceDown = false;
        if (pressed != "cig") Execute("release");
    }

    void CancelPress()
    {
        bool release = pressed == "cig" || spaceDown;
        pressed = "";
        spaceDown = false;
        if (dragging) { dragging = false; SavePosition(); }
        if (input.Capture) input.Capture = false;
        if (release) Execute("release");
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            shown = dragging = spaceDown = false;
            pressed = "";
            timer.Stop(); timer.Dispose();
            tray.Visible = false; tray.Dispose();
            menu.Dispose();
            input.Dispose(); window.Dispose();
            if (engine != null) engine.Dispose();
            canvases.Dispose();
            if (icon != null) icon.Dispose();
        }
        base.Dispose(disposing);
    }

    public sealed class Hit
    {
        public float x { get; set; }
        public float y { get; set; }
        public float w { get; set; }
        public float h { get; set; }
    }
}
