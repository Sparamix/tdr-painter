# Future features

Ideas worth building, with enough design to start from. Add to it; when something ships, move it to the CHANGELOG.

## TDR rise time as a setting (and the window that sets it)

**Today.** The TDR is the step response of S11 times a Kaiser half-window that spans the whole sweep, 0 to f_max. The rise time is an output, about k(β)/f_max: 16.9 ps at 50 GHz with β = 4.2 (k ≈ 0.85). To change it you change f_max or β, and β also changes the ringing.

**What instruments do.** On the Keysight E5071C the 10–90 % step rise time runs from 0.45/f_max with the minimum window (Kaiser β = 0) to 1.466/f_max with the maximum (β = 13). Setting a rise time picks the window for you, so rise time and ringing move together. [1]

**Options.**

| | How the rise time is set | Range | Ringing | Work |
| --- | --- | --- | --- | --- |
| A. Instrument style | Solve for β at the full span (rise time grows steadily with β) | 0.45/f_max to 1.47/f_max | Tied to the rise time | Small: β already exists; only a solver and a control |
| B. Bandwidth | Keep β as the shape and narrow the window to f_w ≤ f_max: W(f) = w_β(f/f_w) below f_w, zero above, so t_r = k(β)/f_w | k(β)/f_max and slower, no upper limit | Set by β alone | Moderate: the window becomes a function of f_w; the rest of the TDR path is unchanged |
| C. Gaussian step | Multiply S11 by a Gaussian filter for the requested t_r, truncated at f_max | Needs the filter 40 to 60 dB down at f_max, so about 1.3/f_max and slower | None to speak of | Larger: a new window family and its own reference |

**Recommendation: B, with A as a preset.** The two controls do separate jobs: β is the ringing and t_r is the resolution. A rise-time setting of "fastest" (f_w = f_max) reproduces today's TDR exactly, so old projects, examples and the validation stay valid. A Kaiser β already runs from a rectangular window (β = 0) to very low sidelobes, which is likely why the E5071C offers only β; other window families would add verification work without adding much.

**Changes.**
- Project: `params.trPs`, where 0 means the fastest for β and f_max. The parser clamps it to at least k(β)/f_max.
- Engine: build the window from f_w = k(β)/t_r. `riseTime()` already measures the window it is given, and `tdr()` is otherwise unchanged. S-parameters do not change at all.
- Page: a "TDR rise time" control in *Frequency sweep and TDR* with a "Fastest" check. The readout shows the rise time actually achieved and the resolution that follows from it.

**Verification.**
- Tier B: compare against scikit-rf with the network cropped to f ≤ f_w. scikit-rf then windows that cropped band with the same Kaiser β, so the math matches.
- A new check: the measured 10–90 % rise time equals the setting within 1 % across β, f_max and t_r, and is clamped where the setting is faster than the band allows.
- The causality and DC checks are unaffected. The tier C round trip changes, as it should.

**Open questions.**
- Should the TDR also offer the impulse response (a 50 % impulse width) next to the step?
- Should the area labels for L and C keep their 30 ps cutoff, or scale it with the rise time?

## Smith chart and S11 phase

A lifted ground on a GSG probe mostly adds loop inductance. On a short standard that barely moves the TDR edge (about L/Z₀) and does not show in |S11|, but on a Smith chart it is a clockwise turn along the outer circle. A series contact resistance moves the point inward along the real axis. A small Smith view of S11, and of S22, with memory traces, would make the probe-on-short examples complete.

## Touchstone import as a memory trace

Read a .s2p from the user's computer, entirely in the page and with no upload, and show it as a memory trace next to the painted model. It would also give its TDR through the same window. That makes the stepped-microstrip comparison in `validation/` something anyone can do with their own measurement. It does not invert S-parameters into a profile: painting stays the way to make a model.

---

[1] Keysight E5071C help, *Transformation to time domain*: https://helpfiles.keysight.com/csg/e5071c/measurement_with_options/time_domain_analysis/transformation_to_time_domain.htm
