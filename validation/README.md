# Validation

Does TDR Painter compute the right S-parameters and TDR for what you paint, and is the physics sound enough to teach with? This folder answers that with independent scikit-rf models, textbook results and two published scikit-rf cases (a VNA measurement and an ANSYS Circuit simulation).

**Read the results in [`report/REPORT.md`](report/REPORT.md).**

```sh
pip install -r validation/requirements.txt
python validation/run_validation.py          # about 30 s; regenerates cases/, reference/ and report/
python validation/run_validation.py --quick  # skips the 10x-finer-grid TDR reference
npm run validate                             # same as the first line
```

The script exits with status 1 if any pass/fail check fails, so it can run in CI.

## What it does

Each case is described once as physics (line sections, lumped elements, stubs, material, ports) in `run_validation.py`. From that description:

- `models.py` writes a TDR Painter project and, separately, builds the same structure in scikit-rf from its own parts: RLGC `DistributedCircuit` lines, scikit-rf's Djordjevic-Svensson permittivity, tee-plus-open stubs, lumped elements and renormalization to the port impedances.
- `engine_runner.js` runs the project through the page's own `src/engine.js`, exactly as the page does (same parser, same cascade, same TDR).
- `run_validation.py` compares the two and runs physics checks on the engine's results.

| Tier | Question | Kind |
| --- | --- | --- |
| A | Same structure, same S11, S21, S22? | pass/fail, 1e-9 |
| B | Same TDR as scikit-rf's windowed step response? | pass/fail, 1e-3 in ρ |
| P | DC limit, passivity, energy conservation, causality (with non-causal negative controls) | pass/fail |
| X | Beatty closed form, quarter-wave stub null, Bloch stopband | pass/fail |
| C | If you paint the TDR trace you see, how close are the S-parameters? | informational |
| R | How close to a VNA measurement and to ANSYS Circuit? | informational |

## Cases

| Case | TDR signature | Variants |
| --- | --- | --- |
| Beatty standard | 25 Ω plateau between 50 Ω leads, multiple reflections | lossy, lossless |
| Via with 60 mil open stub | capacitive dip, ringing, quarter-wave notch in S21 | lossy, lossless with a grid point on the notch |
| Periodic shunt C | train of dips that shrink along the line, Bragg stopband | lossy, lossless |
| Probe launch | inductive spike, pad dip, 42 Ω section, series-R rise | good contact, 3 Ω contact, 3 Ω into a 75 Ω receiver |
| 10 in lossy taper | 50 → 40 → 50 Ω ramps, conductor-loss creep | lossy, lossless |
| Stepped microstrip (scikit-rf) | measured capacitive and inductive sections, SMA connectors | measurement and scikit-rf's MLine model |
| Microstrip taper into 15 Ω (scikit-rf) | 48 → 19 Ω linear and exponential tapers | ANSYS Circuit and scikit-rf's MLine model |

## Files

| Path | What it is |
| --- | --- |
| `run_validation.py` | Case definitions, checks, figures and the report |
| `models.py` | Independent scikit-rf models and the project writer |
| `microstrip.py` | The two cases from scikit-rf's documentation |
| `engine_runner.js` | Runs TDR Painter's engine on project files |
| `cases/` | Every case as a TDR Painter project (open them in the page) |
| `reference/` | scikit-rf's S-parameters of each synthetic case (Touchstone) |
| `report/` | `REPORT.md`, figures and `results.json` (generated) |
| `third_party/scikit-rf/` | Measurement and ANSYS data from scikit-rf's examples, with its BSD license |

## Adding a case

Add a `Structure` to `cases()` in `run_validation.py`: sections as `(length_in, Z)` or `(length_in, Z_start, Z_end)` for a taper, elements in TDR Painter's own form. Positions must sit on the 500-cell grid (multiples of `lenIn / 500`). Rerun the script and commit the regenerated `cases/`, `reference/` and `report/`. Synthetic or published data only, please: nothing under NDA and no product data.
