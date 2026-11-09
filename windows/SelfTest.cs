using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

static class SelfTest
{
    public static void Run(string directory)
    {
        Directory.CreateDirectory(directory);
        string path = Path.Combine(directory, "result.txt");
        try
        {
            using (Desktop app = new Desktop(directory)) app.Test(directory);
            using (Desktop reopened = new Desktop(directory)) reopened.TestSavedStyles();
            File.WriteAllText(path, "Passed");
        }
        catch (Exception e) { File.WriteAllText(path, e.ToString()); Environment.ExitCode = 1; }
    }
}

sealed partial class Desktop
{
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);

    void Assert(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message + " " + JsHost.Text(engine.Call("status")));
    }

    Dictionary<string, object> Status() { return json.Deserialize<Dictionary<string, object>>(JsHost.Text(engine.Call("status"))); }
    void Steps(int count) { for (int i = 0; i < count; i++) Execute("tick", 0.04); }

    public void Test(string directory)
    {
        timer.Stop();
        Application.DoEvents();
        float s = Scale;
        Func<int, int, Point> at = (x, y) => new Point((int)(x * s), (int)(y * s));
        Point pack = at(270, 450), lighter = at(216, 465), cig = at(200, 348), tip = at(132, 338), ashtray = at(118, 462);
        Assert(HitAt(pack) == "pack" && HitAt(lighter) == "lighter" && HitAt(ashtray) == "tray", "Hit targets");
        IntPtr emptyHit = WindowFromPoint(input.PointToScreen(at(170, 130)));
        Assert(emptyHit != window.Handle && emptyHit != input.Handle, "Transparent region receives input");
        Assert(WindowFromPoint(input.PointToScreen(pack)) == input.Handle, "Pack does not receive native input");

        Action<Point> click = delegate(Point p) {
            MouseDown(input, new MouseEventArgs(MouseButtons.Left, 1, p.X, p.Y, 0));
            MouseUp(input, new MouseEventArgs(MouseButtons.Left, 1, p.X, p.Y, 0));
        };
        int initial = (int)Status()["count"], butts = (int)Status()["butts"];
        click(pack); Steps(16);
        Assert((string)Status()["phase"] == "unlit" && HitAt(cig) == "cig", "Draw cigarette");
        TestStyleMenus(directory, at);
        click(lighter); Steps(12);
        Assert((string)Status()["phase"] == "lighting", "Zippo ignition animation");
        SavePreview(Path.Combine(directory, "lighting.png"));
        Steps(13);
        Assert((string)Status()["phase"] == "lit" && (int)Status()["count"] == initial + 1, "Light cigarette");
        MouseDown(input, new MouseEventArgs(MouseButtons.Left, 1, cig.X, cig.Y, 0));
        Steps(18);
        Assert((bool)Status()["puffing"], "Hold cigarette");
        MouseUp(input, new MouseEventArgs(MouseButtons.Left, 1, cig.X, cig.Y, 0));
        Steps(20);
        Assert(!(bool)Status()["puffing"] && (int)Status()["smoke"] >= 20, "Release and exhale");

        using (Bitmap snapshot = new Bitmap(window.Width, window.Height, PixelFormat.Format32bppPArgb))
        {
            using (Graphics g = Graphics.FromImage(snapshot)) { DrawingSetup.Configure(g); Paint(g); }
            Assert(snapshot.GetPixel(pack.X, pack.Y).A > 240 && snapshot.GetPixel(5, 5).A == 0, "Premultiplied transparency");
            snapshot.Save(Path.Combine(directory, "lit.png"), ImageFormat.Png);
        }

        click(tip);
        Assert((double)Convert.ToDouble(Status()["ashPile"]) > 0, "Flick ash");
        click(ashtray); Steps(22);
        Assert((string)Status()["phase"] == "empty" && (int)Status()["butts"] == butts + 1, "Stub cigarette");
        Assert(File.Exists(statePath) && !File.Exists(statePath + ".tmp"), "Save state");
        SelectSize(2); SelectSmoke(2);
        Assert(window.Width == SceneSize.Width && input.Bounds == window.Bounds, "Resize");
        ToggleWindow();
        Assert(!shown && !input.Visible && !timer.Enabled, "Hide and pause");
        ShowWindow();
        Assert(shown && input.Visible && window.Visible, "Restore");
    }

    void TestStyleMenus(string directory, Func<int, int, Point> at)
    {
        Point pack = at(300, 450), lighter = at(215, 472), filter = at(271, 357);
        Color firstPack = canvases.Image(0).GetPixel(pack.X, pack.Y);
        Color firstLighter = canvases.Image(1).GetPixel(lighter.X, lighter.Y);
        Color firstFilter = canvases.Image(1).GetPixel(filter.X, filter.Y);
        string originalStatus = JsHost.Text(engine.Call("status"));
        ((ToolStripMenuItem)cigaretteItem.DropDownItems[2]).PerformClick();
        Assert(canvases.Image(0).GetPixel(pack.X, pack.Y) != firstPack &&
            canvases.Image(1).GetPixel(filter.X, filter.Y) != firstFilter &&
            canvases.Image(1).GetPixel(lighter.X, lighter.Y) == firstLighter, "Changing the pack updates the held filter only");
        ((ToolStripMenuItem)lighterItem.DropDownItems[3]).PerformClick();
        Assert(cigaretteStyle == 2 && lighterStyle == 3 && canvases.Image(1).GetPixel(lighter.X, lighter.Y) != firstLighter,
            "Changing Zippo is independent of the pack");

        for (int i = 0; i < CigaretteStyles.Length; i++)
        {
            ((ToolStripMenuItem)cigaretteItem.DropDownItems[i]).PerformClick();
            ((ToolStripMenuItem)lighterItem.DropDownItems[i % LighterStyles.Length]).PerformClick();
            Assert(JsHost.Text(engine.Call("status")) == originalStatus, "Changing styles resets the game");
            SavePreview(Path.Combine(directory, "style-" + i + ".png"));
        }

        ((ToolStripMenuItem)cigaretteItem.DropDownItems[2]).PerformClick();
        ((ToolStripMenuItem)lighterItem.DropDownItems[1]).PerformClick();
    }

    void SavePreview(string path)
    {
        using (Bitmap snapshot = new Bitmap(window.Width, window.Height, PixelFormat.Format32bppPArgb))
        {
            using (Graphics g = Graphics.FromImage(snapshot))
            {
                g.Clear(Color.FromArgb(35, 40, 50));
                DrawingSetup.Configure(g);
                Paint(g);
            }
            snapshot.Save(path, ImageFormat.Png);
        }
    }

    public void TestSavedStyles()
    {
        UpdateMenu();
        Assert(cigaretteStyle == 2 && lighterStyle == 1 &&
            ((ToolStripMenuItem)cigaretteItem.DropDownItems[2]).Checked &&
            ((ToolStripMenuItem)lighterItem.DropDownItems[1]).Checked, "Style settings survive restarting");
    }
}
