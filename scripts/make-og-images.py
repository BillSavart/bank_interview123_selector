#!/usr/bin/env python3
"""Generate 1200x630 Open Graph share images, one per route.

Run locally (needs Pillow + a CJK font); the PNGs are committed under
public/og/ and referenced by scripts/prerender.mjs. CI does NOT run this —
the images ship as static assets, so no image tooling is needed on the runner.

    python3 scripts/make-og-images.py
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "og"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 1200, 630
SITE = "公股銀行新手村"

FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"

# slug, title, subtitle, top color, bottom color (vertical gradient)
PAGES = [
    ("home",           "面試題目篩選器", "依背景篩選最適合練習的面試題目", (37, 99, 235),  (29, 78, 216)),
    ("calendar",       "招考行事曆",     "八大公股銀行報名筆試面試放榜日期", (8, 145, 178),  (14, 116, 144)),
    ("scores-map",     "筆試門檻",       "台灣地圖看歷年各考區錄取分數",     (5, 150, 105),  (4, 120, 87)),
    ("number-trainer", "大寫數字訓練器", "練習壹貳參…金融大寫數字",          (124, 58, 237), (109, 40, 217)),
    ("check-game",     "支票審查員",     "模擬支票審查、辨識票據錯誤",        (219, 39, 119), (190, 24, 93)),
    ("about",          "使用說明",       "各功能介紹與使用教學",             (71, 85, 105),  (51, 65, 85)),
]


def font(size, index=0):
    return ImageFont.truetype(FONT, size, index=index)


def gradient(top, bottom):
    img = Image.new("RGB", (W, H), top)
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(W):
            px[x, y] = c
    return img


def make(slug, title, subtitle, top, bottom):
    img = gradient(top, bottom)
    d = ImageDraw.Draw(img)

    PAD = 90
    # accent bar
    d.rounded_rectangle([PAD, 150, PAD + 70, 162], radius=6, fill=(255, 255, 255))
    # brand (small, top)
    d.text((PAD, 96), SITE, font=font(40, index=1), fill=(255, 255, 255, 230))
    # page title (big)
    d.text((PAD, 250), title, font=font(110, index=1), fill=(255, 255, 255))
    # subtitle
    d.text((PAD, 410), subtitle, font=font(46, index=0), fill=(235, 240, 255))

    path = OUT / f"{slug}.png"
    img.save(path, "PNG")
    print("wrote", path.relative_to(OUT.parent.parent))


if __name__ == "__main__":
    for p in PAGES:
        make(*p)
