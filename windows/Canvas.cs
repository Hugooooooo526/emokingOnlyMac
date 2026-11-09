using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.Runtime.InteropServices;
using A = JsHost.Args;

sealed class CanvasSet : IDisposable
{
    readonly List<Canvas> canvases = new List<Canvas>();
    readonly Dictionary<string, Color> colors = new Dictionary<string, Color>();
    readonly Dictionary<string, Bitmap> radial = new Dictionary<string, Bitmap>();
    readonly ImageAttributes opacity = new ImageAttributes();
    readonly ColorMatrix matrix = new ColorMatrix();
    readonly PointF[] corners = new PointF[3];
    public Bitmap Image(int id) { return canvases[id].Image; }

    public IntPtr Dispatch(A a)
    {
        if (a.I(0) == 0)
        {
            canvases.Add(new Canvas());
            return JsHost.Num(canvases.Count - 1);
        }
        Canvas c = canvases[a.I(1)];
        switch (a.I(0))
        {
            case 1: c.Resize(a.I(2), a.I(3)); break;
            case 2: c.Path.Reset(); c.HasPoint = false; break;
            case 3: c.Path.CloseFigure(); c.HasPoint = false; break;
            case 4: c.G.Clear(Color.Transparent); break;
            case 5: c.Move(new PointF(a.N(2), a.N(3))); break;
            case 6: c.Line(new PointF(a.N(2), a.N(3))); break;
            case 7: c.Bezier(new PointF(a.N(2), a.N(3)), new PointF(a.N(4), a.N(5)), new PointF(a.N(6), a.N(7))); break;
            case 8: c.Ellipse(a.N(2), a.N(3), a.N(4), a.N(5), a.N(6)); break;
            case 9: c.RoundRect(Rect(a), a.N(6), a.N(7), a.N(8), a.N(9)); break;
            case 10: c.States.Push(c.G.Save()); break;
            case 11: if (c.States.Count != 0) c.G.Restore(c.States.Pop()); break;
            case 12: c.G.TranslateTransform(a.N(2), a.N(3)); break;
            case 13: c.G.ScaleTransform(a.N(2), a.N(3)); break;
            case 14: c.G.RotateTransform(a.N(2) * 180 / (float)Math.PI); break;
            case 15: using (Matrix m = Transform(a)) c.G.Transform = m; break;
            case 16: using (Matrix m = Transform(a)) c.G.MultiplyTransform(m); break;
            case 17: Fill(c, null, a, 2); break;
            case 18: Fill(c, Rect(a), a, 6); break;
            case 19: using (Pen pen = new Pen(ParseColor(a.S(2)), a.N(3))) c.G.DrawPath(pen, c.Path); break;
            case 20: using (Pen pen = new Pen(ParseColor(a.S(6)), a.N(7))) c.G.DrawRectangle(pen, a.N(2), a.N(3), a.N(4), a.N(5)); break;
            case 21: DrawImage(c, Image(a.I(2)), a.N(3), a.N(4), a.N(5), a.N(6), a.N(7)); break;
            case 22: Text(c.G, a.S(2), a.N(3), a.N(4), a.N(6), ParseColor(a.S(5)), true); break;
            default: throw new ArgumentException("Unknown canvas operation");
        }
        return IntPtr.Zero;
    }

    static RectangleF Rect(A a) { return new RectangleF(a.N(2), a.N(3), a.N(4), a.N(5)); }
    static Matrix Transform(A a) { return new Matrix(a.N(2), a.N(3), a.N(4), a.N(5), a.N(6), a.N(7)); }

    public static void Text(Graphics g, string text, float x, float baseline, float size, Color color, bool bold)
    {
        using (Font font = new Font(bold ? "Segoe UI" : "Microsoft YaHei UI", size, bold ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Pixel))
        using (Brush brush = new SolidBrush(color))
        using (StringFormat format = new StringFormat(StringFormat.GenericTypographic))
        {
            format.Alignment = StringAlignment.Center;
            g.DrawString(text, font, brush, x, baseline - size, format);
        }
    }

    void Fill(Canvas c, RectangleF? rect, A a, int i)
    {
        int type = a.I(i);
        if (type == 0)
        {
            using (Brush brush = new SolidBrush(ParseColor(a.S(i + 1)))) FillShape(c, rect, brush);
            return;
        }

        int firstStop = i + (type == 1 ? 5 : 7);
        int count = (a.Count - firstStop) / 2;
        ColorBlend stops = new ColorBlend(count);
        for (int k = 0; k < count; k++)
        {
            stops.Positions[k] = a.N(firstStop + k * 2);
            stops.Colors[k] = ParseColor(a.S(firstStop + k * 2 + 1));
        }
        if (type == 1)
        {
            PointF start = new PointF(a.N(i + 1), a.N(i + 2)), end = new PointF(a.N(i + 3), a.N(i + 4));
            using (LinearGradientBrush brush = new LinearGradientBrush(start, end, stops.Colors[0], stops.Colors[count - 1]))
            {
                brush.InterpolationColors = stops;
                brush.WrapMode = WrapMode.TileFlipXY;
                FillShape(c, rect, brush);
            }
            return;
        }

        // The scene's radial gradients are concentric and cover their entire destination circle.
        float radius = a.N(i + 6), inner = a.N(i + 3) / radius;
        string key = inner.ToString("R", CultureInfo.InvariantCulture);
        for (int k = 0; k < count; k++) key += "|" + a.N(firstStop + k * 2).ToString(CultureInfo.InvariantCulture) + a.S(firstStop + k * 2 + 1);
        Bitmap sprite;
        if (!radial.TryGetValue(key, out sprite))
        {
            sprite = RadialBitmap(inner, stops);
            radial.Add(key, sprite);
        }
        c.G.DrawImage(sprite, new RectangleF(a.N(i + 4) - radius, a.N(i + 5) - radius, radius * 2, radius * 2));
    }

    static void FillShape(Canvas canvas, RectangleF? rect, Brush brush)
    {
        if (rect.HasValue) canvas.G.FillRectangle(brush, rect.Value);
        else canvas.G.FillPath(brush, canvas.Path);
    }

    static Bitmap RadialBitmap(float inner, ColorBlend stops)
    {
        const int side = 128;
        Bitmap result = new Bitmap(side, side, PixelFormat.Format32bppPArgb);
        BitmapData bits = result.LockBits(new Rectangle(0, 0, side, side), ImageLockMode.WriteOnly, result.PixelFormat);
        int[] pixels = new int[side * side];
        for (int y = 0; y < side; y++)
            for (int x = 0; x < side; x++)
            {
                double dx = (x + 0.5) / (side / 2.0) - 1, dy = (y + 0.5) / (side / 2.0) - 1;
                double r = Math.Sqrt(dx * dx + dy * dy);
                if (r >= 1) continue;
                double t = Math.Max(0, (r - inner) / (1 - inner));
                int k = 1;
                while (stops.Positions[k] < t) k++;
                double blend = (t - stops.Positions[k - 1]) / (stops.Positions[k] - stops.Positions[k - 1]);
                Color a = stops.Colors[k - 1], b = stops.Colors[k];
                int alpha = Mix(a.A, b.A, blend);
                pixels[y * side + x] = alpha << 24 | (Mix(a.R, b.R, blend) * alpha / 255) << 16 |
                    (Mix(a.G, b.G, blend) * alpha / 255) << 8 | Mix(a.B, b.B, blend) * alpha / 255;
            }
        Marshal.Copy(pixels, 0, bits.Scan0, pixels.Length);
        result.UnlockBits(bits);
        return result;
    }

    static int Mix(int a, int b, double t) { return (int)Math.Round(a + (b - a) * t); }

    Color ParseColor(string value)
    {
        Color color;
        if (colors.TryGetValue(value, out color)) return color;
        if (value[0] == '#') color = Color.FromArgb(255, Color.FromArgb(int.Parse(value.Substring(1), NumberStyles.HexNumber)));
        else
        {
            string[] parts = value.Substring(value.IndexOf('(') + 1).TrimEnd(')').Split(',');
            int a = parts.Length == 4 ? (int)Math.Round(255 * double.Parse(parts[3], CultureInfo.InvariantCulture)) : 255;
            color = Color.FromArgb(a, int.Parse(parts[0]), int.Parse(parts[1]), int.Parse(parts[2]));
        }
        colors.Add(value, color);
        return color;
    }

    void DrawImage(Canvas c, Bitmap sprite, float x, float y, float w, float h, float alpha)
    {
        if (w == 0) w = sprite.Width;
        if (h == 0) h = sprite.Height;
        if (alpha == 1) { c.G.DrawImage(sprite, new RectangleF(x, y, w, h)); return; }
        corners[0] = new PointF(x, y);
        corners[1] = new PointF(x + w, y);
        corners[2] = new PointF(x, y + h);
        matrix.Matrix33 = alpha;
        opacity.SetColorMatrix(matrix);
        c.G.DrawImage(sprite, corners, new RectangleF(0, 0, sprite.Width, sprite.Height), GraphicsUnit.Pixel, opacity);
    }

    public void Dispose()
    {
        foreach (Canvas canvas in canvases) canvas.Dispose();
        foreach (Bitmap bitmap in radial.Values) bitmap.Dispose();
        opacity.Dispose();
    }

    sealed class Canvas : IDisposable
    {
        public Bitmap Image;
        public Graphics G;
        public readonly GraphicsPath Path = new GraphicsPath(FillMode.Winding);
        public readonly Stack<GraphicsState> States = new Stack<GraphicsState>();
        public bool HasPoint;
        PointF point;

        public void Resize(int width, int height)
        {
            if (Image != null && Image.Width == width && Image.Height == height) return;
            if (G != null) G.Dispose();
            if (Image != null) Image.Dispose();
            Image = new Bitmap(width, height, PixelFormat.Format32bppArgb);
            G = Graphics.FromImage(Image);
            DrawingSetup.Configure(G);
            Path.Reset();
            States.Clear();
        }

        public void Move(PointF next) { Path.StartFigure(); point = next; HasPoint = true; }
        public void Line(PointF next) { if (HasPoint) Path.AddLine(point, next); point = next; HasPoint = true; }
        public void Bezier(PointF a, PointF b, PointF end) { Path.AddBezier(point, a, b, end); point = end; }

        public void Ellipse(float x, float y, float rx, float ry, float angle)
        {
            using (GraphicsPath part = new GraphicsPath())
            using (Matrix transform = new Matrix())
            {
                part.AddEllipse(-rx, -ry, rx * 2, ry * 2);
                transform.Translate(x, y);
                transform.Rotate(angle * 180 / (float)Math.PI);
                part.Transform(transform);
                Path.AddPath(part, false);
            }
        }

        public void RoundRect(RectangleF r, float a, float b, float c, float d)
        {
            Move(new PointF(r.Left + a, r.Top));
            Line(new PointF(r.Right - b, r.Top)); Corner(r.Right, r.Top, b, 270);
            Line(new PointF(r.Right, r.Bottom - c)); Corner(r.Right, r.Bottom, c, 0);
            Line(new PointF(r.Left + d, r.Bottom)); Corner(r.Left, r.Bottom, d, 90);
            Line(new PointF(r.Left, r.Top + a)); Corner(r.Left, r.Top, a, 180);
            Path.CloseFigure();
        }

        void Corner(float x, float y, float radius, int angle)
        {
            if (radius == 0) { point = new PointF(x, y); return; }
            float left = angle == 270 || angle == 0 ? x - 2 * radius : x;
            float top = angle == 0 || angle == 90 ? y - 2 * radius : y;
            Path.AddArc(left, top, 2 * radius, 2 * radius, angle, 90);
            point = Path.GetLastPoint();
        }

        public void Dispose()
        {
            if (G != null) G.Dispose();
            if (Image != null) Image.Dispose();
            Path.Dispose();
        }
    }
}
