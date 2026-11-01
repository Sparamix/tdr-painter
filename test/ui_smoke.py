"""Browser smoke test for dist/index.html.

    pip install playwright && playwright install chromium   # or set CHROME=/path/to/chrome
    npm run build && python test/ui_smoke.py
"""
import asyncio
import json
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
        pg = await browser.new_page(viewport={"width": 1400, "height": 1000}, accept_downloads=True)
        errors, requests = [], []
        pg.on("request", lambda r: requests.append(r.url))
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
        for i in range(1, n):
            await pg.select_option("#preset", str(i - 1))
            await pg.wait_for_timeout(60)
        check("all examples load", True, f"{n - 1} examples")

        # ---- projects: save -> change -> open restores exactly ----
        await pg.select_option("#preset", "0")
        await pg.fill("#p_DkN", "3.7"); await pg.press("#p_DkN", "Enter")
        await pg.fill("#p_zRxN", "85"); await pg.press("#p_zRxN", "Enter")
        await st("(() => { const e = __tdrState.elems[0]; e.locked = true; })()")
        await pg.fill("#projName", "Via study / rev:A")
        snap_js = "JSON.stringify({P: __tdrState.P, prof: Array.from(__tdrState.prof, v => Math.round(v * 1000) / 1000), el: __tdrState.elems.map(({id, ...e}) => e)})"
        before = await st(snap_js)
        async with pg.expect_download() as dl_info:
            await pg.click("#projSave")
        dl = await dl_info.value
        check("save names the file from the project", dl.suggested_filename == "Via study rev A.json", dl.suggested_filename)
        saved = pathlib.Path(await dl.path()).read_text()
        doc = json.loads(saved)
        check("saved file is a v1 project", doc.get("format") == "tdr-painter-project" and doc.get("formatVersion") == 1)
        await pg.select_option("#preset", "2")   # replace everything
        await pg.fill("#p_DkN", "4.2"); await pg.press("#p_DkN", "Enter")
        tmp = ROOT / "test" / "_roundtrip.json"
        tmp.write_text(saved)
        await pg.set_input_files("#projFile", str(tmp))
        await pg.wait_for_timeout(150)
        after = await st(snap_js)
        check("open restores params, profile and elements", after == before)
        check("open restores the project name", await pg.input_value("#projName") == "Via study / rev:A")
        await pg.click("#undo")
        check("undo after open restores the previous project", await st("__tdrState.P.Dk") == 4.2)

        # malformed and foreign files are refused without changing anything
        tmp.write_text("{not json")
        await pg.set_input_files("#projFile", str(tmp))
        await pg.wait_for_timeout(100)
        check("invalid JSON is refused", "isn’t valid JSON" in await pg.inner_text("#projStatus") and await st("__tdrState.P.Dk") == 4.2)
        tmp.write_text(json.dumps({"format": "something-else"}))
        await pg.set_input_files("#projFile", str(tmp))
        await pg.wait_for_timeout(100)
        check("foreign JSON is refused", "isn’t a TDR Painter project" in await pg.inner_text("#projStatus"))
        hostile = dict(doc, params=dict(doc["params"], Dk=1e9, lenIn=-5, zTx="x"), elements=[{"type": "__proto__"}, {"type": "C", "x": 99, "value": 1e6, "count": 1e6}])
        tmp.write_text(json.dumps(hostile))
        await pg.set_input_files("#projFile", str(tmp))
        await pg.wait_for_timeout(100)
        clamped = await st("({Dk: __tdrState.P.Dk, len: __tdrState.P.lenIn, zTx: __tdrState.P.zTx, el: __tdrState.elems.map(e => [e.type, e.x, e.value, e.count])})")
        check("out-of-range values are clamped", clamped == {"Dk": 6, "len": 0.25, "zTx": 50, "el": [["C", 0.25, 1, 30]]}, clamped)
        tmp.unlink()

        # ---- privacy: the page made no requests beyond its own file ----
        outside = [u for u in requests if not u.startswith(("file://", "data:", "blob:"))]
        check("no network requests during the whole session", not outside, outside[:5])
        check("no console or page errors", not errors, errors)
        blocked = await pg.evaluate("fetch('https://example.com/x').then(() => 'sent', () => 'blocked')")
        check("CSP makes the browser block a deliberate fetch", blocked == "blocked")
        await browser.close()


async def claude_host():
    """The artifact build inside claude.ai: Save goes through the platform's downloads dialog."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get("CHROME") or None, args=["--no-sandbox"])
        frag = (ROOT / "dist" / "tdr-painter.artifact.html").read_text()
        page_file = ROOT / "test" / "_artifact_host.html"
        page_file.write_text('<!doctype html><html><head><meta charset="utf-8"></head><body>' + frag + '</body></html>')
        for mode in ("granted", "absent"):
            pg = await browser.new_page()
            await pg.add_init_script("""
              window.__saves = [];
              window.claude = { use: async (name) => (name === 'downloads' && '%s' === 'granted')
                ? { save: async (r) => { window.__saves.push(r); return { status: 'saved' }; } } : null };
            """ % mode)
            await pg.goto(page_file.as_uri())
            await pg.wait_for_timeout(300)
            await pg.fill("#projName", "In claude")
            await pg.click("#projSave")
            await pg.wait_for_timeout(150)
            if mode == "granted":
                saves = await pg.evaluate("window.__saves.map(s => [s.filename, JSON.parse(s.data).format])")
                check("claude.ai: save goes to the platform dialog", saves == [["In claude.json", "tdr-painter-project"]], saves)
            else:
                shown = await pg.is_visible("#projFallback")
                text = await pg.input_value("#projFallbackText")
                check("claude.ai without downloads: copyable fallback", shown and json.loads(text)["name"] == "In claude")
            await pg.close()
        page_file.unlink()
        await browser.close()


asyncio.run(main())
asyncio.run(claude_host())
print("\nALL PASS" if not fails else f"\n{len(fails)} FAILED")
sys.exit(1 if fails else 0)
