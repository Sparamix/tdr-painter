"""Browser smoke test for dist/index.html.

    pip install playwright && playwright install chromium   # or set CHROME=/path/to/chrome
    npm run build && python test/ui_smoke.py
"""
import asyncio
import io
import json
import os
import zipfile
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
        await pg.select_option("#preset", label="Board launch + via stub")
        await pg.fill("#p_DkN", "3.7"); await pg.press("#p_DkN", "Enter")
        await pg.fill("#p_zRxN", "85"); await pg.press("#p_zRxN", "Enter")
        await st("(() => { const e = __tdrState.elems[0]; e.locked = true; })()")
        await pg.fill("#projName", "Via study / rev:A")
        snap_js = "JSON.stringify({P: __tdrState.P, prof: Array.from(__tdrState.prof, v => Math.round(v * 1000) / 1000), el: __tdrState.elems.map(({id, ...e}) => e)})"
        before = await st(snap_js)
        async with pg.expect_download() as dl_info:
            await pg.click("#projSave")
        dl = await dl_info.value
        check("save writes <name>.tdrp", dl.suggested_filename == "Via study rev A.tdrp", dl.suggested_filename)
        tdrp_bytes = pathlib.Path(await dl.path()).read_bytes()
        with zipfile.ZipFile(io.BytesIO(tdrp_bytes)) as z:
            check(".tdrp is a valid ZIP whose CRCs check out", z.testzip() is None and z.namelist() == ["project.json"])
            doc = json.loads(z.read("project.json"))
        check(".tdrp holds a v1 project", doc.get("format") == "tdr-painter-project" and doc.get("formatVersion") == 1)
        async with pg.expect_download() as dl_info:
            await pg.click("#projJson")
        dl = await dl_info.value
        saved_json = pathlib.Path(await dl.path()).read_text()
        check("Export JSON writes <name>.json with the same project", dl.suggested_filename == "Via study rev A.json"
              and {k: v for k, v in json.loads(saved_json).items() if k != "savedAt"} == {k: v for k, v in doc.items() if k != "savedAt"})
        check(".tdrp is smaller than the JSON export", len(tdrp_bytes) < len(saved_json), f"{len(saved_json)} -> {len(tdrp_bytes)} B")

        tmp_t = ROOT / "test" / "_roundtrip.tdrp"
        tmp = ROOT / "test" / "_roundtrip.json"
        for label, path, data in ((".tdrp", tmp_t, tdrp_bytes), ("JSON", tmp, saved_json.encode())):
            await pg.select_option("#preset", label="45 Ω trace (impedance tolerance)")   # replace everything
            await pg.fill("#p_DkN", "4.2"); await pg.press("#p_DkN", "Enter")
            path.write_bytes(data)
            await pg.set_input_files("#projFile", str(path))
            await pg.wait_for_timeout(150)
            check(f"open {label} restores params, profile and elements", await st(snap_js) == before)
            check(f"open {label} restores the project name", await pg.input_value("#projName") == "Via study / rev:A")
        await pg.click("#undo")
        check("undo after open restores the previous project", await st("__tdrState.P.Dk") == 4.2)

        # a damaged .tdrp is refused and nothing changes
        bad = bytearray(tdrp_bytes); bad[len(bad) // 3] ^= 0x10
        tmp_t.write_bytes(bytes(bad))
        await pg.set_input_files("#projFile", str(tmp_t))
        await pg.wait_for_timeout(150)
        check("damaged .tdrp is refused, state unchanged", "damaged" in await pg.inner_text("#projStatus") and await st("__tdrState.P.Dk") == 4.2,
              await pg.inner_text("#projStatus"))
        tmp_t.write_bytes(tdrp_bytes[: len(tdrp_bytes) - 40])
        await pg.set_input_files("#projFile", str(tmp_t))
        await pg.wait_for_timeout(150)
        check("truncated .tdrp is refused", "damaged" in await pg.inner_text("#projStatus") and await st("__tdrState.P.Dk") == 4.2)
        tmp_t.unlink()

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
                saves = await pg.evaluate("window.__saves.map(s => [s.filename, String.fromCharCode(...new Uint8Array(s.data.buffer || s.data).slice(0, 2))])")
                check("claude.ai: .tdrp.zip goes to the platform dialog", saves == [["In claude.tdrp.zip", "PK"]], saves)
                await pg.click("#projJson")
                await pg.wait_for_timeout(150)
                last = await pg.evaluate("(() => { const s = window.__saves[window.__saves.length - 1]; return [s.filename, JSON.parse(s.data).format]; })()")
                check("claude.ai: Export JSON goes to the platform dialog", last == ["In claude.json", "tdr-painter-project"], last)
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
