"""Compose the 30 s PlanetX Atlas demo (1920x1080, 30 fps) from real app captures.

Camera moves (pan/zoom) over 2x screenshots, crossfades, captions synced to the narration,
chapter tags and the closing title. Frames are piped raw to ffmpeg (H.264, yuv420p).
Timeline (seconds) is read from timeline.json if present (written after voice alignment).
"""
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
FR = HERE / "frames"
W, H, FPS = 1920, 1080, 30
TOTAL = 30.0
FONT_B = "C:/Windows/Fonts/segoeuib.ttf"
FONT_R = "C:/Windows/Fonts/segoeui.ttf"
FONT_T = "C:/Windows/Fonts/bahnschrift.ttf"
CYAN, GOLD = (125, 211, 252), (251, 191, 36)

# Crop rectangles in source pixels (3840x2160 screenshots).
FULL = (0, 0, 3840, 2160)
VIEW = (870, 470, 2870, 1595)            # SPHEREx viewer canvas
SOLAR = (40, 230, 2920, 1850)            # 3D canvas with UI around
SOLAR_IN = (500, 560, 2460, 1663)
RANK = (230, 200, 2830, 1662)
BENNU = (1341, 566, 3840, 1972)          # composition card + porkchop
EXPL = (60, 250, 2400, 1566)
EXPL_IN = (400, 420, 2060, 1354)

DEFAULT_T = {"s1": 0.0, "s2": 4.6, "s3": 9.0, "s4": 12.8, "s5": 17.6, "s6": 22.6, "s7": 28.0, "end": 30.0}
CAPTIONS = [  # (start, end, text) — replaced by aligned timings when timeline.json exists
    (0.3, 4.4, "Every six months, NASA's SPHEREx maps the entire sky in 102 infrared colors."),
    (4.7, 8.8, "PlanetX Atlas turns it into a time machine. Pick any star, and watch it move."),
    (9.1, 12.6, "Every moving dot is checked against NASA catalogs."),
    (12.9, 17.4, "Follow it into a Solar System of 1.6 million real orbits."),
    (17.7, 22.4, "Rank 7,212 reachable asteroids and plan the mission..."),
    (22.7, 27.6, "...then explore them in 3D and VR."),
]
KEYWORDS = {"SPHEREx": CYAN, "102": CYAN, "PlanetX": CYAN, "Atlas": CYAN, "move.": GOLD, "NASA": CYAN,
            "1.6": GOLD, "million": GOLD, "7,212": GOLD, "VR.": GOLD, "3D": GOLD, "time": GOLD, "machine.": GOLD}

_cache: dict[str, Image.Image] = {}


def img(path: str) -> Image.Image:
    if path not in _cache:
        if len(_cache) > 40:
            _cache.clear()
        _cache[path] = Image.open(FR / f"{path}.png").convert("RGB")
    return _cache[path]


def ease(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def lerp_rect(a, b, p):
    return tuple(a[i] + (b[i] - a[i]) * p for i in range(4))


def view(src: str, rect) -> Image.Image:
    x0, y0, x1, y1 = rect
    return img(src).resize((W, H), Image.LANCZOS, box=(x0, y0, x1, y1))


def scene_frame(name: str, u: float, d: float) -> Image.Image:
    """u = seconds since scene start, d = scene duration."""
    p = u / d
    if name == "s1":
        k = min(15, int(u / 0.27))
        return view(f"s1_barnard/{k:04d}", lerp_rect(FULL, VIEW, ease(p * 1.4)))
    if name == "s2":
        if u < d * 0.55:  # blink A/B
            k = int(u / 0.33) % 2
            return view(f"s2_blink/{k:04d}", lerp_rect(VIEW, (1180, 640, 2560, 1416), ease(p / 0.55)))
        return view("s2_diff/0000", lerp_rect((1180, 640, 2560, 1416), (1400, 760, 2340, 1289), ease((p - 0.55) / 0.45)))
    if name == "s3":
        k = min(11, int(u / (d / 12)))
        return view(f"s3_psyche/{k:04d}", lerp_rect(VIEW, (1120, 610, 2620, 1454), ease(p)))
    if name == "s4":
        k = min(149, int(p * 149))
        return view(f"s4_solar/{k:04d}", lerp_rect(SOLAR, SOLAR_IN, ease(p)))
    if name == "s5":
        if p < 0.36:
            return view("s5_rank/0000", lerp_rect(FULL, RANK, ease(p / 0.36)))
        if p < 0.66:
            return view("s5_bennu/0000", lerp_rect((1650, 560, 3840, 1792), (2050, 700, 3840, 1707), ease((p - 0.36) / 0.3)))
        return view("s5_bennu/0001", lerp_rect((1700, 250, 3840, 1454), (2040, 330, 3840, 1343), ease((p - 0.66) / 0.34)))
    if name == "s6":
        k = min(164, int(p * 164))
        return view(f"s6_explorer/{k:04d}", lerp_rect(EXPL, EXPL_IN, ease(p)))
    if name == "s7":
        k = min(74, int(p * 74))
        z = 1 + 0.12 * ease(p)  # slow push forward
        cw, ch = 3840 / z, 2160 / z
        return view(f"s7_outro/{k:04d}", ((3840 - cw) / 2, (2160 - ch) / 2, (3840 + cw) / 2, (2160 + ch) / 2))
    raise KeyError(name)


TAGS = {
    "s1": "REAL NASA SPHEREx DATA · BARNARD'S STAR",
    "s2": "BARNARD'S STAR MOVES ~10″/YEAR — MEASURED IN SPHEREx",
    "s3": "ASTEROID 16 PSYCHE · MATCHES JPL PREDICTION WITHIN 2″",
    "s4": "1,582,561 ASTEROIDS & COMETS · NASA/JPL SBDB",
    "s5": "BENNU · OSIRIS-REx SAMPLES · BEST LAUNCH 2030-10-09",
    "s6": "BENNU · 3D & VR EXPLORER · SCALE vs EIFFEL TOWER",
}


def draw_tag(im: Image.Image, text: str, a: float):
    if a <= 0:
        return
    f = ImageFont.truetype(FONT_B, 30)
    d = ImageDraw.Draw(im, "RGBA")
    w = d.textlength(text, font=f)
    x, y = 60, 52
    d.rounded_rectangle((x - 16, y - 10, x + w + 16, y + 44), 8, fill=(8, 12, 30, int(200 * a)), outline=(125, 211, 252, int(200 * a)), width=2)
    d.text((x, y - 2), text, font=f, fill=(125, 211, 252, int(255 * a)))


def draw_caption(im: Image.Image, text: str, a: float):
    if a <= 0:
        return
    f = ImageFont.truetype(FONT_B, 50)
    d = ImageDraw.Draw(im, "RGBA")
    words = text.split()
    lines, cur = [], []
    for wd in words:  # wrap to ~1500 px
        if d.textlength(" ".join(cur + [wd]), font=f) > 1500 and cur:
            lines.append(cur)
            cur = []
        cur.append(wd)
    lines.append(cur)
    lh = 64
    top = H - 90 - lh * len(lines)
    widths = [d.textlength(" ".join(l), font=f) for l in lines]
    bw = max(widths)
    d.rounded_rectangle(((W - bw) / 2 - 34, top - 18, (W + bw) / 2 + 34, top + lh * len(lines) + 14), 18,
                        fill=(5, 8, 19, int(185 * a)))
    for li, (line, lw) in enumerate(zip(lines, widths)):
        x = (W - lw) / 2
        for wd in line:
            col = KEYWORDS.get(wd, (244, 247, 252))
            d.text((x, top + li * lh), wd, font=f, fill=(*col, int(255 * a)))
            x += d.textlength(wd + " ", font=f)


def draw_title(im: Image.Image, a: float):
    if a <= 0:
        return
    d = ImageDraw.Draw(im, "RGBA")
    f1, f2 = ImageFont.truetype(FONT_B, 96), ImageFont.truetype(FONT_R, 38)
    t1, t2 = "PlanetX Atlas", "From a moving dot to a mission destination"
    w1, w2 = d.textlength(t1, font=f1), d.textlength(t2, font=f2)
    glow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.text(((W - w1) / 2, 410), t1, font=f1, fill=(125, 211, 252, int(180 * a)))
    im.paste(Image.alpha_composite(im.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(14))).convert("RGB"))
    d = ImageDraw.Draw(im, "RGBA")
    d.text(((W - w1) / 2, 410), t1, font=f1, fill=(244, 247, 252, int(255 * a)))
    d.text(((W - w2) / 2, 540), t2, font=f2, fill=(186, 200, 225, int(230 * a)))
    f3 = ImageFont.truetype(FONT_T, 26)
    t3 = "NASA SPACE APPS CHALLENGE · PLANET X AND SPHEREx"
    d.text(((W - d.textlength(t3, font=f3)) / 2, 610), t3, font=f3, fill=(125, 211, 252, int(200 * a)))


def main(out: str):
    tl = json.loads((HERE / "timeline.json").read_text()) if (HERE / "timeline.json").exists() else {}
    T = tl.get("scenes", DEFAULT_T)
    caps = [tuple(c) for c in tl.get("captions", CAPTIONS)]
    names = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"]
    bounds = [(n, T[n], T[names[i + 1]] if i + 1 < len(names) else T["end"]) for i, n in enumerate(names)]
    XF = 0.35  # crossfade length
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "16",
                           "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], stdin=subprocess.PIPE)
    n_frames = int(round(TOTAL * FPS))
    for fi in range(n_frames):
        t = fi / FPS
        cur = next(b for b in bounds if b[1] <= t < b[2] or b is bounds[-1])
        name, a, b = cur
        im = scene_frame(name, t - a, b - a)
        idx = names.index(name)
        if idx > 0 and t - a < XF:  # crossfade from the previous scene's tail
            pn, pa, pb = bounds[idx - 1]
            prev = scene_frame(pn, min(t - pa, pb - pa - 1e-3), pb - pa)
            im = Image.blend(prev, im, ease((t - a) / XF))
        if name != "s7":
            tag_a = ease((t - a - 0.15) / 0.35) * (1 - ease((t - (b - 0.3)) / 0.3))
            draw_tag(im, TAGS[name], tag_a)
        for c0, c1, text in caps:
            if c0 - 0.2 <= t <= c1 + 0.2:
                draw_caption(im, text, ease((t - c0 + 0.2) / 0.25) * (1 - ease((t - c1) / 0.2)))
        if name == "s7":
            draw_title(im, ease((t - a - 0.2) / 0.5) * (1 - ease((t - (TOTAL - 0.9)) / 0.5)))
        if t > TOTAL - 0.35:  # final fade to black
            im = Image.blend(im, Image.new("RGB", (W, H)), ease((t - (TOTAL - 0.35)) / 0.35))
        if t < 0.25:
            im = Image.blend(Image.new("RGB", (W, H)), im, ease(t / 0.25))
        ff.stdin.write(im.tobytes())
        if fi % 90 == 0:
            print("frame", fi, flush=True)
    ff.stdin.close()
    ff.wait()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(HERE / "video_silent.mp4"))
