"""Capture real PlanetX Atlas footage, scene by scene, as PNG sequences (1920x1080 @2x).

Every frame is a screenshot of the running app (http://127.0.0.1:8765) driven by Playwright,
so the demo video shows the real software and its real data.
Usage: python capture.py [scene ...]
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8765"
OUT = Path(__file__).parent / "frames"
VW, VH = 1920, 1080


def shot(page, folder: str, i: int, clip=None):
    d = OUT / folder
    d.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(d / f"{i:04d}.png"), clip=clip, animations="allow")


def click_text(page, text: str, role: str = "button"):
    page.get_by_role(role, name=text, exact=False).first.click()


def open_case(page, title: str):
    page.goto(f"{URL}/?tab=visor")
    page.wait_for_timeout(1500)
    page.get_by_role("button", name=title, exact=True).first.click()
    page.wait_for_selector("text=real frames", timeout=60000)
    page.wait_for_timeout(1200)


def scene_barnard(page):
    """S1 + S2: Barnard's Star played as a video, then difference and blink."""
    open_case(page, "Barnard's Star")
    n = int(page.inner_text("text=real frames").split()[0])
    for i in range(n):
        shot(page, "s1_barnard", i)
        page.get_by_label("Next frame").click()
        page.wait_for_timeout(120)
    click_text(page, "Difference")
    page.wait_for_timeout(500)
    shot(page, "s2_diff", 0)
    click_text(page, "Blink A/B")
    page.wait_for_timeout(300)
    for i in range(2):  # frame A and frame B
        shot(page, "s2_blink", i)
        page.get_by_label("Next frame").click()
        page.wait_for_timeout(200)
    page.get_by_role("button", name="Set A").click()


def scene_psyche(page):
    """S3: asteroid 16 Psyche crossing the field with JPL predictions overlaid."""
    open_case(page, "Asteroid 16 Psyche in motion")
    page.get_by_label("Known asteroids (JPL)").check()
    n = int(page.inner_text("text=real frames").split()[0])
    for i in range(n):
        page.wait_for_function("() => !document.body.innerText.includes('querying…')", timeout=60000)
        page.wait_for_timeout(250)
        shot(page, "s3_psyche", i)
        page.get_by_label("Next frame").click()


def solar_page(page, fullscreen: bool):
    page.goto(f"{URL}/?tab=solar")
    page.wait_for_function("() => document.body.innerText.includes('1,582,561 bodies')", timeout=120000)
    if fullscreen:
        page.add_style_tag(content="""
          header, aside, footer { display:none !important }
          main { padding:0 !important; max-width:none !important }
          .panel.relative { position:fixed !important; inset:0 !important; height:100vh !important; border:0 !important; border-radius:0 !important; z-index:50 }
          .panel.relative > div.absolute { display:none !important }""")
    page.wait_for_timeout(2500)


def set_range(page, label: str, value: float):
    page.evaluate("""([label, value]) => {
      const el = document.querySelector(`input[aria-label="${label}"]`);
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(value)); el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
    }""", [label, value])


def scene_solar(page, frames: int = 150):
    """S4: the living Solar System (UI visible), time running while the camera orbits."""
    solar_page(page, fullscreen=False)
    page.get_by_placeholder("Bennu, Psyche, 433, 2024 YR4…").fill("Psyche")
    page.keyboard.press("Enter")
    page.wait_for_timeout(1500)
    jd0 = page.evaluate("() => Number(document.querySelector('input[aria-label=\"Date\"]').value)")
    box = page.locator("canvas").first.bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy)
    for _ in range(4):  # start a little closer
        page.mouse.wheel(0, -260)
        page.wait_for_timeout(60)
    page.mouse.down()
    for i in range(frames):
        set_range(page, "Date", jd0 + i * 4)  # 4 days per frame -> planets and asteroids move
        page.mouse.move(cx + i * 2.2, cy - i * 0.35)
        page.wait_for_timeout(30)
        shot(page, "s4_solar", i)
    page.mouse.up()


def scene_prospect(page):
    """S5: prospecting ranking, then Bennu card with composition and porkchop."""
    page.goto(f"{URL}/?tab=prospect")
    page.wait_for_selector("text=Highest-interest prospecting candidates")
    page.wait_for_selector("tbody tr", timeout=60000)
    page.wait_for_timeout(800)
    shot(page, "s5_rank", 0)
    page.locator("tbody tr").first.click()
    page.wait_for_selector("text=Composition: what we know", timeout=60000)
    page.get_by_role("button", name="Calculate").click()
    page.wait_for_selector("text=Best window", timeout=120000)
    page.wait_for_timeout(800)
    aside = page.locator("aside").filter(has_text="Planner: launch windows").first
    aside.scroll_into_view_if_needed()
    shot(page, "s5_bennu", 0)
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(400)
    shot(page, "s5_bennu", 1)


def scene_explorer(page, frames: int = 165):
    """S6: Bennu in the 3D/VR explorer, rotating, with a scale comparison."""
    page.goto(f"{URL}/?tab=explorer")
    page.wait_for_selector("text=101955 Bennu", timeout=60000)
    page.locator("select", has=page.locator("option", has_text="Eiffel")).select_option(label="Eiffel Tower (330 m)")
    page.wait_for_timeout(1500)
    box = page.locator("canvas").first.bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    for i in range(frames):
        page.mouse.move(cx - i * 3.0, cy + (i * 0.25 if i < 80 else (160 - i) * 0.25))
        if i == 95:
            page.mouse.up()
            page.get_by_label("Composition layer", exact=False).check()
            page.mouse.move(cx - i * 3.0, cy)
            page.mouse.down()
        page.wait_for_timeout(25)
        shot(page, "s6_explorer", i)
    page.mouse.up()


def scene_outro(page, frames: int = 75):
    """S7: cinematic fly-through of the Solar System (no UI), music only."""
    solar_page(page, fullscreen=True)
    jd0 = page.evaluate("() => Number(document.querySelector('input[aria-label=\"Date\"]').value)")
    w, h = VW, VH
    page.mouse.move(w / 2, h / 2)
    for _ in range(9):  # dive into the inner Solar System
        page.mouse.wheel(0, -300)
        page.wait_for_timeout(50)
    page.wait_for_timeout(1200)
    page.mouse.down()
    for i in range(frames):
        set_range(page, "Date", jd0 + i * 6)
        page.mouse.move(w / 2 + i * 3.5, h / 2 - i * 1.2)
        if i % 3 == 0:
            page.mouse.wheel(0, 70)  # pull back towards the stars
        page.wait_for_timeout(30)
        shot(page, "s7_outro", i)
    page.mouse.up()


SCENES = {"barnard": scene_barnard, "psyche": scene_psyche, "solar": scene_solar,
          "prospect": scene_prospect, "explorer": scene_explorer, "outro": scene_outro}


def main():
    wanted = sys.argv[1:] or list(SCENES)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=False,
                                    args=["--window-position=-2400,0", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"])
        for name in wanted:
            ctx = browser.new_context(viewport={"width": VW, "height": VH}, device_scale_factor=2)
            page = ctx.new_page()
            t = time.time()
            SCENES[name](page)
            print(name, "done in", round(time.time() - t, 1), "s", flush=True)
            ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
