"""
XCoda brand icons — original Fenwick Labs mark.
Idea pattern: five vertical EQ bars on dark (common audio metaphor).
Original expression: asymmetric “coda swell” heights, chunky rounded caps,
near-B/W tokens. Drawn procedurally — no third-party asset copied.
"""
from PIL import Image, ImageDraw
import os

OUT = r"C:\Users\Lenovo\Projects\soundblast\icons"
os.makedirs(OUT, exist_ok=True)

BG = (18, 18, 18, 255)
FG = (242, 242, 242, 255)
CLEAR = (0, 0, 0, 0)

# Asymmetric coda swell (unique to XCoda — not classic 1-2-3-2-1)
BAR_H = (0.30, 0.58, 1.00, 0.74, 0.42)


def draw_mark(size: int) -> Image.Image:
    # Draw at 4× then downscale for crisp AA edges on 48/128
    scale = 4 if size >= 48 else (2 if size >= 32 else 1)
    S = size * scale
    img = Image.new("RGBA", (S, S), CLEAR)
    d = ImageDraw.Draw(img)

    pad = max(scale, S // 18)
    r = max(2 * scale, S // 5)
    d.rounded_rectangle([pad, pad, S - 1 - pad, S - 1 - pad], radius=r, fill=BG)

    inset = S * 0.20
    area_l, area_r = inset, S - inset
    area_t, area_b = inset, S - inset
    area_w = area_r - area_l
    area_h = area_b - area_t

    n = 5
    bar_w = area_w * 0.118
    gap = area_w * 0.048
    total = n * bar_w + (n - 1) * gap
    start_x = area_l + (area_w - total) / 2
    mid_y = (area_t + area_b) / 2
    max_h = area_h * 0.90
    radius = bar_w / 2

    for i, h_ratio in enumerate(BAR_H):
        h = max_h * h_ratio
        x0 = start_x + i * (bar_w + gap)
        x1 = x0 + bar_w
        y0 = mid_y - h / 2
        y1 = mid_y + h / 2
        d.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=FG)

    if scale > 1:
        img = img.resize((size, size), Image.LANCZOS)
    return img


def draw_pixel16() -> Image.Image:
    """Dedicated 16px grid — readable in Chrome toolbar."""
    g = 16
    img = Image.new("RGBA", (g, g), CLEAR)
    px = img.load()

    for y in range(g):
        for x in range(g):
            if (x, y) in {
                (0, 0), (1, 0), (0, 1),
                (15, 0), (14, 0), (15, 1),
                (0, 15), (1, 15), (0, 14),
                (15, 15), (14, 15), (15, 14),
            }:
                continue
            px[x, y] = BG

    # heights match coda swell scaled to 16: 3, 6, 10, 7, 4
    heights = [3, 6, 10, 7, 4]
    bar_w, gap = 2, 1
    total = 5 * bar_w + 4 * gap
    x0 = (g - total) // 2
    mid = g // 2
    for i, h in enumerate(heights):
        bx = x0 + i * (bar_w + gap)
        y0 = mid - h // 2
        for y in range(y0, y0 + h):
            for x in range(bx, bx + bar_w):
                px[x, y] = FG
    return img


for sz in (16, 32, 48, 128):
    path = os.path.join(OUT, f"icon{sz}.png")
    img = draw_pixel16() if sz == 16 else draw_mark(sz)
    img.save(path)
    print("wrote", path)

svg = """<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="XCoda">
  <rect x="6" y="6" width="116" height="116" rx="26" fill="#121212"/>
  <rect x="26" y="53" width="12" height="22" rx="6" fill="#F2F2F2"/>
  <rect x="44" y="43" width="12" height="42" rx="6" fill="#F2F2F2"/>
  <rect x="62" y="28" width="12" height="72" rx="6" fill="#F2F2F2"/>
  <rect x="80" y="37" width="12" height="54" rx="6" fill="#F2F2F2"/>
  <rect x="98" y="49" width="12" height="30" rx="6" fill="#F2F2F2"/>
</svg>
"""
with open(os.path.join(OUT, "logo.svg"), "w", encoding="utf-8") as f:
    f.write(svg)
print("ok")
