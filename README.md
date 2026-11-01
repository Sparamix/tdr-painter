# TDR Painter

Paint a TDR impedance profile, drop in parasitics, and watch return loss, insertion loss, ILD and the power balance respond. Built as a teaching demo for signal and power integrity: it shows how the shapes you see on a TDR become S11 and S21.

Everything runs in the browser from one HTML file. There is no backend; a full solve plus TDR takes 1 to 10 ms, and nothing you do leaves your computer (see [Privacy](#privacy)).

## Use it

Open `dist/index.html` in a browser, or serve the `dist/` folder with GitHub Pages.

- **Paint** the profile with Draw, Push / pull, Plateau, Smooth and Erase. Short bumps are labeled with their equivalent lumped L or C.
- **Drop in** a shunt C, series L, series R or open (via) stub. Drag the chips in the strip under the plot, set copies and pitch for periodic loading.
- **Lock** an element so it can't be dragged by accident, or **Clone** it to get a copy beside it that you can drag into place.
- **Compare** with Pin reference, and export the current S-parameters as Touchstone text.
- **Save** a project as a `.json` file on your computer and **Open** it later, or drop the file onto the page. Ctrl/⌘ S and Ctrl/⌘ O work too.

## Privacy

TDR Painter has no server side. It sends nothing anywhere, uses no analytics or cookies, and keeps nothing in browser storage. A project exists only as the `.json` file you save; Open reads a file you pick and validates every value before using it.

You don't have to take that on trust:

- **The browser enforces it.** `dist/index.html` carries a Content-Security-Policy with `default-src 'none'` and `connect-src 'none'`, so the browser refuses any outgoing connection the page might attempt. Fonts are embedded, so there are no font requests either.
- **You can watch it.** Open the browser's developer tools, Network tab: after the page itself loads, nothing else is requested, whatever you paint, save or open.
- **The tests check it.** `npm test` fails if a network or storage API, or any external URL, appears in the build. `test/ui_smoke.py` drives the page in Chrome, fails on any request beyond the page file, and confirms the CSP blocks a deliberate `fetch`.
- **It works offline.** Download `index.html` and open it from disk; nothing needs a server.

The claude.ai build is the same code. There, Save goes through claude.ai's own save dialog.

## Project files

A project is plain JSON (format version 1):

```json
{
  "format": "tdr-painter-project", "formatVersion": 1, "app": "0.3.0",
  "name": "Via stub study", "savedAt": "2026-11-01T07:20:00.000Z",
  "params":   { "lenIn": 2, "z0": 50, "Dk": 3.35, "Df": 0.004, "frefGHz": 12, "zTx": 50, "zRx": 50, "fmaxGHz": 50, "beta": 4.2, "...": "..." },
  "profile":  { "cells": 500, "runs": [[50, 230], [49.2, 1], "..."] },
  "elements": [ { "type": "stub", "x": 1, "stubZ": 45, "stubLen": 60, "count": 1, "pitch": 0.15, "locked": true } ],
  "view":     { "zMin": 20, "zMax": 80 }
}
```

The profile is run-length encoded as `[impedance in Ω, number of cells]`. Element `type` is `C` (pF), `L` (nH), `R` (Ω) or `stub`. Values out of range are clamped on open, and unknown fields are ignored.

## How it works

- The profile is 500 equal cells. Each cell is a uniform lossy line of its painted impedance; lumped elements sit on cell boundaries. S-parameters come from the ABCD cascade, so they are exact for that structure.
- R′ and L′ scale with Z and C′ with 1/Z, so loss per inch is the same everywhere and only reflections change with what you paint.
- Dielectric: Djordjevic-Sarkar, `ε(f) = ε∞ + Δε·ln((f₂+jf)/(f₁+jf)) / ln(f₂/f₁)`, anchored to Dk and Df at f_ref (same form and corner defaults as scikit-rf's `djordjevicsvensson`). Defaults are the Megtron 6 R-5775(N) datasheet point, Dk 3.35 and Df 0.004 at 12 GHz.
- Conductor: `R_dc + (1+j)·K·√f` per unit length, which keeps the line causal.
- TDR: S11 times a Kaiser half-window centered on DC (β 4.2 by default), inverse FFT, running sum, then `Z = Z_Tx(1+ρ)/(1−ρ)`.
- Equivalent L/C labels use the TDR area method, `L = 2Z₀∫ρ dt` and `C = −(2/Z₀)∫ρ dt` over round-trip time.
- ILD is dB(S21) minus a least-squares fit of `a0 + a1√f + a2·f + a4·f²` over the sweep.
- 1-D TEM only: no radiation, coupling or mode conversion.

## Develop

```sh
npm run build   # src/ + fonts/ -> dist/index.html and dist/tdr-painter.artifact.html
npm test        # build, engine checks against analytic cases, privacy check (Node, no dependencies)
python test/skrf_crosscheck.py   # optional, needs scikit-rf
python test/ui_smoke.py          # optional, needs Playwright and Chrome
```

| Path | What it is |
| --- | --- |
| `src/engine.js` | Physics: dielectric model, cascade, S-parameters, TDR, ILD fit |
| `src/page.html` | UI; `/*ENGINE*/` is replaced by the engine at build time |
| `build.js` | Produces the two single-file builds in `dist/` |
| `fonts/` | Self-hosted Archivo, Instrument Sans and JetBrains Mono (latin and greek subsets) with their licenses |
| `test/` | Engine tests, privacy check, scikit-rf cross-check, browser smoke test |

## References

- A. R. Djordjevic, R. M. Biljic, V. D. Likar-Smiljanic, T. K. Sarkar, "Wideband frequency-domain characterization of FR-4 and time-domain causality," IEEE Trans. EMC, vol. 43, no. 4, pp. 662–667, 2001.
- D. J. Dascher, "Measuring Parasitic Capacitance and Inductance Using TDR," Hewlett-Packard Journal, Apr. 1996.
- A. Healey, "Fitted insertion loss and insertion loss deviation," IEEE P802.3ba Task Force, Jul. 2009.
- Panasonic MEGTRON 6 R-5775(N) data sheet.

## License

Code: to be chosen before publishing. Fonts: SIL Open Font License 1.1, see `fonts/OFL-*.txt` (Archivo, Instrument Sans and JetBrains Mono, packaged by Fontsource).
