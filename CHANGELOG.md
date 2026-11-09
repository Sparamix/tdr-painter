# Changelog

## 0.8.5 (2026-11-09)

- **Probing**, a new group in the Example menu: a GSG probe on a cal short and on a 42 Ω microstrip, each with a good landing (30 mΩ), a bad signal contact (2 Ω) and a lifted ground tip (50 pH more loop inductance). They replace the two "Probes on 42 Ω stripline" examples (a probe cannot land on a stripline: it is buried) and the two cal-short examples. The notes give the sources for the contact and inductance values, and say where the tool cannot show the effect: a lifted ground on a short changes only the phase of S11, which the tool does not plot yet.
- The validation's probe-launch case is now described as a 42 Ω line, not a stripline. Its results are unchanged.
- The header no longer scrolls sideways on phones; the smoke test checks 320 and 390 px.

## 0.8.4 (2026-11-08)

- Light and dark mode moved out of Settings to a sun/moon button beside the gear. The icon shows the mode a click switches to, and its tooltip says so. Switching back to what your system shows removes the override, so later system changes apply again. Nothing is saved.

## 0.8.3 (2026-11-08)

- Settings has a Theme switch: Auto (follows the system), Light or Dark. It is not saved, so each visit starts on Auto; inside claude.ai, Auto follows the host's theme.
- The subtitle no longer calls the frequency views "the exact cascade"; it says the S-parameters come from cascading the line cells. `CITATION.cff` drops the same word.
- The README shows a dark screenshot on GitHub's dark themes.

## 0.8.2 (2026-11-07)

- Plateau no longer shows the brush preview at the cursor: it spans what you drag. The brush size still sets how soft its edges are, as the slider's tooltip now explains.

Published as part of [Sparamix](https://github.com/Sparamix). The simulator is unchanged; this is packaging:

- License: GNU GPL v3 or later (`LICENSE`), SPDX headers in the sources, and the notice at the top of both builds. Fonts and the validation's scikit-rf data keep their own licenses (`THIRD-PARTY-NOTICES.md`).
- Icon in the Sparamix style, in the README, the page header (light and dark) and as the favicon.
- README rewritten in the Sparamix style; the project file format moved to `doc/FILE_FORMAT.md` and now covers every field.
- `CITATION.cff`, repository links in `package.json` and `CONTRIBUTING.md`.
- CI: `npm test` on Node 20.12 and 24, the browser smoke test, the validation suite, and a GitHub Pages deployment of `dist/index.html`.
- The tests need Node 20.12 or later (documented as 18 before): the `.tdrp` tests use `CompressionStream('deflate-raw')`.

## 0.8.1 (2026-11-07)

- Element editor: Remove has a trash icon; the Enabled check sits before the element's symbol and greys it out when off; Lock now freezes every value and Remove, not only the position (Enabled and Clone stay available); Position, Copies # and Copies pitch sit in a shared Placement row, in the same place for every element.
- Shift-click a side-panel arrow to send that panel to the top or the bottom.
- The memory buttons moved from the header to just above the TDR panel, right-aligned.
- `ROADMAP.md` lists future features, starting with a design for a TDR rise-time setting.

## 0.8.0 (2026-11-07)

- **Attenuator** drop-in: an ideal resistive T pad with Zin (Tx side), Zout (Rx side) and loss in dB, held at or above the minimum-loss pad when Zin and Zout differ. Validated against scikit-rf resistors and the closed form.
- **Enabled** check on every element: a disabled element stays in the project and on the strip (faded, dashed, struck through) but leaves the circuit.
- **Memory traces named as on a VNA:** Data → Memory, Hide/Show memory, Clear memory (was Pin reference / Clear reference).
- **Units** in the settings menu: imperial (in, mil, per inch) or metric (mm, per cm). Files keep inches; the choice is saved as `view.units`.
- **Side-panel groups move** up and down with arrow buttons; the order is saved as `view.panels`.
- Brush: the toolbar reads Brush and Brush size, hovering the TDR shows the brush's size and shape at the cursor, and Flatten is now Reset profile.
- Transmission line group (was Line) with Line Z₀ and a Lossless transmission line switch for both losses at once.
- ILD now sits under insertion loss; Copies # and Copies pitch; Frequency sweep and TDR; the experimental range is marked with an orange asterisk.

## 0.7.1 (2026-11-07)

- Conductor and dielectric loss switch off separately: **Lossless conductor** and **Lossless dielectric** sit at the top of their groups and dim the sliders they turn off (`params.condLossless`, `params.dielLossless`). `lossless` still means both, and older projects that set it open with both checks ticked.
- The TDR plot range is now the first group in the side panel, next to the TDR, with the logarithmic axis switch; Fit is renamed **Autoscale**. The settings menu keeps the experimental option.
- "How the model works" moved to the main column, under the frequency readout.

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
