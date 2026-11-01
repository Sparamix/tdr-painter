# TDR Painter

Paint a TDR impedance profile, drop in parasitics, and watch return loss, insertion loss, ILD and the power balance respond. Built as a teaching demo for signal and power integrity: it shows how the shapes you see on a TDR become S11 and S21.

Everything runs in the browser from one HTML file. There is no backend; a full solve plus TDR takes 1 to 10 ms.

## Use it

Open `dist/index.html` in a browser, or serve the `dist/` folder with GitHub Pages.

- **Paint** the profile with Draw, Push / pull, Plateau, Smooth and Erase. Short bumps are labeled with their equivalent lumped L or C.
- **Drop in** a shunt C, series L, series R or open (via) stub. Drag the chips in the strip under the plot, set copies and pitch for periodic loading.
- **Compare** with Pin reference, and export the current S-parameters as Touchstone text.

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
npm run build   # src/ -> dist/index.html and dist/tdr-painter.artifact.html
npm test        # engine checks against analytic cases (Node, no dependencies)
python test/skrf_crosscheck.py   # optional, needs scikit-rf
python test/ui_smoke.py          # optional, needs Playwright and Chrome
```

| Path | What it is |
| --- | --- |
| `src/engine.js` | Physics: dielectric model, cascade, S-parameters, TDR, ILD fit |
| `src/page.html` | UI; `/*ENGINE*/` is replaced by the engine at build time |
| `build.js` | Produces the two single-file builds in `dist/` |
| `test/` | Engine tests, scikit-rf cross-check, browser smoke test |

## References

- A. R. Djordjevic, R. M. Biljic, V. D. Likar-Smiljanic, T. K. Sarkar, "Wideband frequency-domain characterization of FR-4 and time-domain causality," IEEE Trans. EMC, vol. 43, no. 4, pp. 662–667, 2001.
- D. J. Dascher, "Measuring Parasitic Capacitance and Inductance Using TDR," Hewlett-Packard Journal, Apr. 1996.
- A. Healey, "Fitted insertion loss and insertion loss deviation," IEEE P802.3ba Task Force, Jul. 2009.
- Panasonic MEGTRON 6 R-5775(N) data sheet.

## License

To be chosen before publishing.
