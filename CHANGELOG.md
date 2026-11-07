# Changelog

## 0.7.0 (2026-11-07)

- Settings menu (the gear) with **Allow extra low and high impedances**, an experimental option: Tx and Rx, the painted profile, stub impedance and series R go from 1 mΩ (a short) to 1 MΩ (an open), with log-scale sliders, and Rx gets Short, Open and Line Z₀ buttons. The option is saved with the project (`params.extremeZ`); turning it off brings values back into the normal ranges, and Undo restores them.
- Logarithmic impedance axis for the TDR plot (`view.log`), with paint tools that work in ratios on it, so contact resistance in the milliohms is readable next to 50 Ω.
- Shorted stubs: a stub's far end can be open or shorted to ground (`"end": "short"`). A 1 mΩ open stub is a nanofarad capacitor, open at DC, and the editor now says so; a 1 mΩ shorted stub is a short to ground, DC included.
- Impedances below 1 Ω are stored with four significant digits (1 mΩ steps from 1 Ω up, as before).
- New examples: a GSG probe on a short standard with good (30 mΩ) and bad (0.5 Ω) contact.
- Validation: a sixth case, the probe on a short, at 1 mΩ and 1 MΩ ports, a painted 1 mΩ section and a 1 mΩ shorted stub, checked against scikit-rf; the TDR's late level reads the contact resistance to within 1 mΩ.

## 0.6.0 (2026-11-07)

- New `validation/` suite: five synthetic structures (Beatty standard, via with a 60 mil open stub, periodic shunt C, probe launch with good and bad contact, 10 in lossy taper) built independently in scikit-rf and compared with the engine, plus physics checks (DC, passivity, energy, causality with non-causal negative controls), textbook results (Beatty closed form, quarter-wave stub null, Bloch stopband), a paint-the-TDR round trip, and two cases from scikit-rf's documentation (a measured stepped microstrip and a taper simulated in ANSYS Circuit). `npm run validate` regenerates `validation/report/REPORT.md`.
- Fixed: the TDR was drawn half a sample (about 1.2 ps at 50 GHz) early, because the step response was a running sum of the impulse response. It is now integrated by the trapezoid rule, as in scikit-rf, and time zero falls on a sample. Sharp edges moved by up to 0.029 in ρ (about 3 Ω); S-parameters are unchanged.
- Fixed a race in `test/ui_smoke.py` that read element chips before they were laid out.

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
