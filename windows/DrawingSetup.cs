using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;

static class DrawingSetup
{
    public static void Configure(Graphics graphics)
    {
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.InterpolationMode = InterpolationMode.Bilinear;
        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
        graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
    }
}
