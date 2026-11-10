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

## TDR from the Rx port

**What.** An optional, read-only TDR plot under the TDR Canvas, computed from S22 with Z_Rx as the source impedance, through the same window as the main TDR. Painting stays on the canvas.

**Why it teaches.**
- Each discontinuity changes the step that reaches the ones behind it: the step incident on a second mismatch is (1 + ρ₁) times the original, and re-reflections between the two arrive later [2, pp. 15–16]. Energy reflected early never reaches later discontinuities, which can mask their true response, and VNA time gating does not undo this [3]. From the Rx end the order reverses, so what was behind is now in front. The *Masking: two identical 30 Ω sections* example would show both views at once.
- Loss and a real taper look alike from one end. Series resistance makes the reflected voltage rise along the line [2, p. 12], [4]. A real impedance trend flips its slope when you launch from the other end; the rise from resistance does not [4]. Two TDRs side by side tell them apart.

**Changes.**
- Engine: none to the model. `solve()` already returns S22; the plot needs one more `tdr()` call and Z = Z_Rx (1 + ρ)/(1 − ρ) in place of Z_Tx.
- Page: a "TDR from Rx" check in *Frequency sweep and TDR*. The plot uses the canvas's Z range and the same memory traces.
- Project: `view.rxTdr` (default false). Older versions ignore it, so the format version stays 1.

**Verification.**
- Mirror check: the Rx TDR of a project equals the main TDR of its mirror image (profile reversed, elements moved to L − x, pad `zIn` and `zOut` swapped, Z_Tx and Z_Rx swapped) to round-off.
- Tier B: the S11 TDR checks against scikit-rf, repeated on S22.

**Open questions.**
- Distance axis: lined up under the canvas with Rx on the right, so every feature sits under the cell that made it, or its own axis starting at Rx on the left, the way an instrument shows it?
- Repeat the ≈L and ≈C area labels on it?

## Transmission-line drop-in element

**What.** A drop-in element that is a uniform line with its own length, Z₀, Dk, Df, f_ref, conductor loss and R_dc: a cable or connector body between two boards, a section on another laminate, a short segment with much more or less loss.

**Why it teaches.** A TDR turns time into distance with one propagation velocity, v = c/√ε_r, from one dielectric constant set for the whole path [2, pp. 4, 7], [5]. A section with a different Dk then shows up on the distance axis longer or shorter than it is, and everything behind it moves. The canvas would show the section at its physical place and length, and the TDR where an instrument puts it.

**Options.**

| | Placement | Line length | Painted cells | Work |
| --- | --- | --- | --- | --- |
| A. Span | Covers x to x + len of the painted line | Unchanged | Kept but ignored under the span while the element is enabled; disabling it brings them back | Moderate |
| B. Insert | Spliced in at x | Grows by len | The canvas needs a break or a new scale | Larger |

**Recommendation: A.** The 500-cell canvas and the line length stay as they are, `enabled` already means "leave it out of the cascade", and the physical length on the canvas against the apparent length in the TDR is the point of the element. A long cable fits under A by lengthening the line.

**Changes.**
- Project: `{ "type": "tline", "x", "len", "z0", "Dk", "Df", "frefGHz", "condLoss", "rdc" }`, with `count` fixed at 1, the line's own ranges, and `x + len` clamped to the line length.
- Engine: `prepare()` builds the element's own γ(f) and ζ(f) = Z_c / Z_nominal with its Djordjevic-Sarkar and conductor terms, the same code the line uses. In `solve()` the cells under an enabled span use those arrays and the element's Z₀ instead of the line's. Today every cell shares one γ and one ζ.
- Page: a `T Line` chip in Drop in; the span drawn as a band on the canvas at its Z₀, with its extent on the chip strip; the usual editor for its fields.

**Verification.**
- With the line's own parameters, the span gives the same S-parameters as painting those cells at its Z₀, to round-off.
- Delay: an edge crosses the span in len·√Dk/c, so on the distance axis it appears len·√(Dk_span/Dk_line) long.
- Tier B: a scikit-rf cascade with a second line built from the element's parameters.

**Open questions.**
- Two overlapping spans: refuse, or the later one wins?
- Lumped elements inside a span: keep them (a via in the middle of a cable makes little sense, a pad on another laminate does)?
- Mark the span's apparent length on the TDR distance axis?

## Smith chart and S11 phase

A lifted ground on a GSG probe mostly adds loop inductance. On a short standard that barely moves the TDR edge (about L/Z₀) and does not show in |S11|, but on a Smith chart it is a clockwise turn along the outer circle. A series contact resistance moves the point inward along the real axis. A small Smith view of S11, and of S22, with memory traces, would make the probe-on-short examples complete.

## Touchstone import as a memory trace

Read a .s2p from the user's computer, entirely in the page and with no upload, and show it as a memory trace next to the painted model. It would also give its TDR through the same window. That makes the stepped-microstrip comparison in `validation/` something anyone can do with their own measurement. It does not invert S-parameters into a profile: painting stays the way to make a model.

---

[1] Keysight E5071C help, *Transformation to time domain*: https://helpfiles.keysight.com/csg/e5071c/measurement_with_options/time_domain_analysis/transformation_to_time_domain.htm

[2] Agilent Technologies, *Time Domain Reflectometry Theory*, Application Note 1304-2: velocity and distance pp. 4 and 7, cable loss p. 12, multiple discontinuities pp. 15–16. https://www.hpmemoryproject.org/an/pdf/an_1304-2.pdf

[3] Keysight E5080B help, *Time Domain*, section "Gating" (masking): https://helpfiles.keysight.com/csg/e5080b/Time/TimeDomain.htm

[4] J.-P. Joosting, "TDR interconnect analysis applications: measurement caveats, tips and techniques," eeNews Europe, Feb. 5, 2018: https://www.eenewseurope.com/en/tdr-interconnect-analysis-applications-measurement-caveats-tips-and-techniques/

[5] Keysight FlexDCA programmer's guide, `:DCONstant` (dielectric constant for the distance axis): https://helpfiles.keysight.com/scopes/FlexDCA-PG/Content/Topics/Commands/GRAPh/T_OHMS_X_DCONstant.htm
