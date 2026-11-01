# Changelog

## 0.5.0 (2026-11-01)

- Examples are now data: `examples/*.json`, bundled at build time, shown in a grouped menu with a note on what to look at. 15 built-in examples, including probed 42 Ω stripline with good and bad contact, a 5 in serpentine with corner capacitance, a ghost spike after a via stub, masking, resolution, pad compensation and lossy creep.
- `src/project.js` holds the project format and its validating parser, shared by the page and `test/examples.test.js`, which checks every example for range, note and passivity.
- The element strip uses up to three rows, so stacked elements (a probe tip's R and L next to the pad C) all stay visible.
- Series R goes down to 0.01 Ω for good contacts.
- CONTRIBUTING.md and an *Example idea* issue template.

## 0.4.1 (2026-11-01)

- Pinned reference curves are now dotted and keep the color of the curve they were pinned from (orange for TDR and S11, blue for S21 and ILD), so they no longer look like the gray dashed S21 fit. One rule across the page: solid is the live result, dashed is a helper, dotted is the pinned reference.

## 0.4.0 (2026-11-01)

- New `.tdrp` project file: a standard ZIP holding `project.json`, deflated with the browser's built-in compressor and protected by a CRC-32 per entry. Open verifies it and refuses damaged, truncated, encrypted or oversized files. Typical projects shrink from about 4.5 KB to under 1 KB.
- Save writes `.tdrp` (`.tdrp.zip` inside claude.ai); Export JSON keeps the readable format; Open accepts both and detects the type by content.
- `src/tdrp.js` with its own tests, including interop with Python's `zipfile` and zip-bomb limits.

## 0.3.0 (2026-11-01)

- Save a project as a `.json` file and Open it again (file picker, drag and drop, Ctrl/⌘ S and Ctrl/⌘ O). Opening validates and clamps every value, and Undo brings back the previous project.
- Inside claude.ai, Save uses the platform's save dialog, with a copyable fallback where saving isn't available.
- Privacy by construction: fonts are embedded instead of loaded from Google Fonts, the standalone build carries a Content-Security-Policy that blocks all outgoing connections, and nothing is kept in browser storage.
- New `test/privacy.test.js` (static) and browser checks for zero network requests and CSP enforcement.

## 0.2.0 (2026-10-31)

- Lock / Unlock for placed elements. A locked element can still be selected and edited, but its chip won't drag and its position field is disabled; the chip shows a padlock.
- Clone duplicates the selected element (values, copies and pitch) to the nearest open spot beside it, unlocked and selected, ready to drag into place.
- Version shown in the page footer and in Touchstone export headers.
- Repository layout: `src/`, `build.js`, `dist/` standalone and artifact builds, engine tests, scikit-rf cross-check, browser smoke test.

## 0.1.0 (2026-10-31)

First version.

- Paint tools on the TDR plot: Draw, Push / pull, Plateau, Smooth, Erase, with Undo and Flatten.
- Drop-in elements: shunt C, series L, series R, open stub; copies and pitch for periodic loading.
- Exact lossy cascade with Djordjevic-Sarkar dielectric and causal skin-effect conductor loss.
- Band-limited TDR from S11 with a Kaiser window; rise time and spatial resolution readouts.
- Return loss, insertion loss with fit, ILD, and power balance plots; pinned reference overlay.
- Touchstone export (v1, or v2.0 with [Reference] for unequal port impedances).
