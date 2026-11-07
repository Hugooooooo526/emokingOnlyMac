#!/usr/bin/env python3
# 生成 native/AppIcon.icns。只在图标要改时运行，需要 Pillow。
import math, os, random, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFilter

S = 1024
random.seed(4)
bg = Image.new('RGBA', (S, S), (0, 0, 0, 0))
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((100, 100, 924, 924), 185, fill=255)
grad = Image.new('RGBA', (S, S))
d = ImageDraw.Draw(grad)
for y in range(S):
    t = y / S
    d.line((0, y, S, y), fill=(int(62 - 34 * t), int(24 - 8 * t), int(38 - 14 * t), 255))
bg.paste(grad, (0, 0), mask)

smoke = Image.new('RGBA', (S, S), (0, 0, 0, 0))
sd = ImageDraw.Draw(smoke)
for i in range(70):
    t = i / 69
    x = 350 + math.sin(t * 6.4) * (20 + 70 * t) + 40 * t
    y = 590 - 400 * t
    r = 7 + 62 * t ** 1.5
    a = int(120 * (1 - t) ** 1.2) + 12
    sd.ellipse((x - r, y - r, x + r, y + r), fill=(225, 228, 234, a))
smoke = smoke.filter(ImageFilter.GaussianBlur(16))
bg.alpha_composite(Image.composite(smoke, Image.new('RGBA', (S, S), (0, 0, 0, 0)), mask))

cig = Image.new('RGBA', (S, S), (0, 0, 0, 0))
c = ImageDraw.Draw(cig)
c.rectangle((330, 595, 640, 655), fill=(246, 243, 236, 255))
c.rectangle((640, 595, 770, 655), fill=(214, 158, 92, 255))
c.rectangle((640, 595, 652, 655), fill=(216, 181, 106, 255))
c.rectangle((316, 595, 338, 655), fill=(255, 112, 36, 255))
cig = cig.rotate(-9, center=(330, 625), resample=Image.BICUBIC)
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse((262, 565, 382, 685), fill=(255, 110, 30, 150))
bg.alpha_composite(glow.filter(ImageFilter.GaussianBlur(28)))
bg.alpha_composite(cig)

with tempfile.TemporaryDirectory() as tmp:
    iconset = os.path.join(tmp, 'AppIcon.iconset')
    os.mkdir(iconset)
    for size in (16, 32, 128, 256, 512):
        for mul, tag in ((1, ''), (2, '@2x')):
            bg.resize((size * mul, size * mul), Image.LANCZOS).save(f'{iconset}/icon_{size}x{size}{tag}.png')
    subprocess.check_call(['iconutil', '-c', 'icns', iconset, '-o', 'native/AppIcon.icns'])
