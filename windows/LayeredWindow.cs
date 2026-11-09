using System;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Windows.Forms;

sealed class LayeredWindow : Form
{
    const int Layered = 0x80000, Transparent = 0x20, NoActivate = 0x8000000;
    const string DefaultShowMessage = "EmoKing.Windows.Show.1";
    readonly int showMessage;
    readonly bool clickThrough;
    public event Action ShowRequested;
    Surface surface;

    public LayeredWindow(string title = "EmoKing", bool clickThrough = true, string showRequest = DefaultShowMessage)
    {
        this.clickThrough = clickThrough;
        showMessage = RegisterWindowMessage(showRequest);
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.None;
        StartPosition = FormStartPosition.Manual;
        Text = title;
    }

    protected override bool ShowWithoutActivation { get { return true; } }
    protected override CreateParams CreateParams
    {
        get { CreateParams cp = base.CreateParams; cp.ExStyle |= Layered | NoActivate; if (clickThrough) cp.ExStyle |= Transparent; return cp; }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == showMessage && ShowRequested != null) ShowRequested();
        base.WndProc(ref m);
    }

    public static void RequestShow(string message = DefaultShowMessage)
    { PostMessage(new IntPtr(0xffff), RegisterWindowMessage(message), IntPtr.Zero, IntPtr.Zero); }

    public void Draw(Action<Graphics> paint)
    {
        if (surface == null || surface.Bitmap.Size != Size)
        {
            if (surface != null) surface.Dispose();
            surface = new Surface(Size);
        }
        surface.Graphics.Clear(Color.Transparent);
        paint(surface.Graphics);
        surface.Graphics.Flush(System.Drawing.Drawing2D.FlushIntention.Sync);
        Point position = Location, source = Point.Empty;
        Size size = Size;
        Blend blend = new Blend { Alpha = 255, Format = 1 };
        if (!UpdateLayeredWindow(Handle, IntPtr.Zero, ref position, ref size, surface.Dc, ref source, 0, ref blend, 2))
            throw new Win32Exception();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing && surface != null) surface.Dispose();
        base.Dispose(disposing);
    }

    sealed class Surface : IDisposable
    {
        public readonly IntPtr Dc;
        public readonly Bitmap Bitmap;
        public readonly Graphics Graphics;
        readonly IntPtr bitmap, previous;

        public Surface(Size size)
        {
            Dc = CreateCompatibleDC(IntPtr.Zero);
            if (Dc == IntPtr.Zero) throw new Win32Exception();
            try
            {
                Header header = new Header { Size = 40, Width = size.Width, Height = -size.Height, Planes = 1, Bits = 32 };
                IntPtr pixels;
                bitmap = CreateDIBSection(Dc, ref header, 0, out pixels, IntPtr.Zero, 0);
                if (bitmap == IntPtr.Zero) throw new Win32Exception();
                previous = SelectObject(Dc, bitmap);
                Bitmap = new Bitmap(size.Width, size.Height, size.Width * 4, PixelFormat.Format32bppPArgb, pixels);
                Graphics = Graphics.FromImage(Bitmap);
                DrawingSetup.Configure(Graphics);
            }
            catch { Dispose(); throw; }
        }

        public void Dispose()
        {
            if (Graphics != null) Graphics.Dispose();
            if (Bitmap != null) Bitmap.Dispose();
            if (previous != IntPtr.Zero) SelectObject(Dc, previous);
            if (bitmap != IntPtr.Zero) DeleteObject(bitmap);
            DeleteDC(Dc);
        }
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct Blend { public byte Operation, Flags, Alpha, Format; }
    [StructLayout(LayoutKind.Sequential)]
    struct Header
    {
        public uint Size;
        public int Width, Height;
        public ushort Planes, Bits;
        public uint Compression, SizeImage;
        public int XPelsPerMeter, YPelsPerMeter;
        public uint ColorsUsed, Important;
    }

    [DllImport("user32.dll", SetLastError = true)] static extern bool UpdateLayeredWindow(IntPtr hwnd, IntPtr dest,
        ref Point position, ref Size size, IntPtr source, ref Point offset, uint key, ref Blend blend, uint flags);
    [DllImport("gdi32.dll", SetLastError = true)] static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll", SetLastError = true)] static extern IntPtr CreateDIBSection(IntPtr dc, ref Header header,
        uint usage, out IntPtr pixels, IntPtr section, uint offset);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr dc, IntPtr item);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr item);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int RegisterWindowMessage(string name);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool PostMessage(IntPtr hwnd, int message, IntPtr w, IntPtr l);
}

sealed class InputWindow : Form
{
    public InputWindow()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.None;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.Black;
        Opacity = 1.0 / 255;
        KeyPreview = true;
        Text = "EmoKing controls";
    }

    protected override bool ShowWithoutActivation { get { return true; } }
}
