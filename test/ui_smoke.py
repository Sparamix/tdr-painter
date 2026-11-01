"""Browser smoke test for dist/index.html.

    pip install playwright && playwright install chromium   # or set CHROME=/path/to/chrome
    npm run build && python test/ui_smoke.py
"""
import asyncio
import os
import pathlib
import sys

from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
PAGE = (ROOT / "dist" / "index.html").as_uri()
fails = []


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}{('  ' + str(detail)) if detail else ''}")
    if not ok:
        fails.append(name)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--no-sandbox"])
        pg = await browser.new_page(viewport={"width": 1400, "height": 1000})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        await pg.goto(PAGE)
        await pg.wait_for_timeout(600)
        st = lambda js: pg.evaluate(js)
        cv = await pg.locator("#tdr").bounding_box()

        async def chip_center(eid):
            chips = await st("__tdrState.chips")
            c = next(c for c in chips if c["id"] == eid)
            return cv["x"] + (c["x0"] + c["x1"]) / 2, cv["y"] + (c["y0"] + c["y1"]) / 2

        async def drag(x, y, dx):
            await pg.mouse.move(x, y)
            await pg.mouse.down()
            await pg.mouse.move(x + dx, y, steps=8)
            await pg.mouse.up()

        # select and drag the first element chip
        first = await st("__tdrState.elems[0].id")
        x0 = await st("__tdrState.elems[0].x")
        x, y = await chip_center(first)
        await pg.mouse.click(x, y)
        check("chip click selects element", await st("__tdrState.selId") == first)
        await drag(x, y, 100)
        x1 = await st("__tdrState.elems[0].x")
        check("unlocked chip drags", x1 > x0 + 0.05, (x0, x1))

        # lock: chip and position field stop moving the element
        await pg.click("#edLock")
        check("lock sets the flag", await st("__tdrState.elems[0].locked") is True)
        check("lock disables the position field", await pg.locator("#edXN").is_disabled())
        x, y = await chip_center(first)
        await drag(x, y, 120)
        check("locked chip does not drag", abs(await st("__tdrState.elems[0].x") - x1) < 1e-9)
        check("locked chip still selects", await st("__tdrState.selId") == first)
        # clone: new unlocked copy beside the source, selected, same values
        n_before = await st("__tdrState.elems.length")
        await pg.click("#edClone")
        clone = await st("__tdrState.elems[__tdrState.elems.length - 1]")
        src = await st(f"__tdrState.elems.find(e => e.id === {first})")
        check("clone adds one element", await st("__tdrState.elems.length") == n_before + 1)
        check("clone is selected and unlocked", await st("__tdrState.selId") == clone["id"] and clone["locked"] is False)
        same = all(clone.get(k) == src.get(k) for k in ("type", "value", "stubZ", "stubLen", "count", "pitch"))
        check("clone copies values", same)
        check("clone sits beside the source", 0 < abs(clone["x"] - src["x"]) <= 0.25, (src["x"], clone["x"]))
        cx, cy = await chip_center(clone["id"])
        await drag(cx, cy, 60)
        check("clone drags while source stays", await st(f"__tdrState.elems.find(e => e.id === {clone['id']}).x") > clone["x"] + 0.02
              and abs(await st(f"__tdrState.elems.find(e => e.id === {first}).x") - x1) < 1e-9)
        await pg.click("#undo")
        await pg.click("#undo")
        check("undo removes the clone", await st("__tdrState.elems.length") == n_before)
        await pg.click("#undo")
        check("undo unlocks", await st(f"__tdrState.elems.find(e => e.id === {first}).locked") is False)

        # paint with Push / pull
        await pg.click("[data-tool=push]")
        before = await st("Math.max(...__tdrState.prof)")
        px = cv["x"] + cv["width"] * 0.55
        await pg.mouse.move(px, cv["y"] + 160)
        await pg.mouse.down()
        await pg.mouse.move(px, cv["y"] + 100, steps=8)
        await pg.mouse.up()
        after = await st("Math.max(...__tdrState.prof)")
        check("push tool raises the profile", after > before + 2, (before, after))
        await pg.click("#undo")
        check("undo restores the profile", abs(await st("Math.max(...__tdrState.prof)") - before) < 1e-9)

        # every example loads
        n = await pg.locator("#preset option").count()
        for i in range(n):
            await pg.select_option("#preset", str(i))
            await pg.wait_for_timeout(60)
        check("all examples load", True, f"{n} examples")

        check("no console or page errors", not errors, errors)
        await browser.close()


asyncio.run(main())
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED")
sys.exit(1 if fails else 0)
