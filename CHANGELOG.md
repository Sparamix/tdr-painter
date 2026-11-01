# Changelog

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
