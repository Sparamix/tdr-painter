#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Giorgi Maghlakelidze. Part of TDR Painter (Sparamix).
// Writes the built-in examples to examples/*.json. The JSON files are the source of truth that build.js
// bundles into the page; this script only exists to regenerate the built-in set reproducibly.
// Community examples don't need it: export JSON from the page, add an "example" block, open a PR.
'use strict';
const fs = require('fs');
const path = require('path');
const PJ = require('../src/project.js');

const NS = 500;
const OUT = path.join(__dirname, '..', 'examples');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

const C = (x, pF, extra) => ({ type: 'C', x, value: pF, count: 1, pitch: 0.15, locked: false, ...extra });
const L = (x, nH, extra) => ({ type: 'L', x, value: nH, count: 1, pitch: 0.15, locked: false, ...extra });
const R = (x, ohm, extra) => ({ type: 'R', x, value: ohm, count: 1, pitch: 0.15, locked: false, ...extra });
const STUB = (x, mil, z, extra) => ({ type: 'stub', x, stubZ: z, stubLen: mil, end: 'open', count: 1, pitch: 0.15, locked: false, ...extra });

function example({ slug, order, category, name, note, params = {}, paint, elements = [], view = null, isDefault = false, author = 'TDR Painter' }) {
  const P = PJ.normalizeLoss({ ...PJ.DEFAULTS, ...params });
  const prof = new Float64Array(NS).fill(P.z0);
  const cellX = (i) => (i + 0.5) / NS * P.lenIn;
  const t = {
    fill: (z) => prof.fill(z),
    bump(xc, wIn, dz) {
      const s = wIn / 2;
      for (let i = 0; i < NS; i++) { const u = (cellX(i) - xc) / s; if (Math.abs(u) < 4) prof[i] += dz * Math.exp(-0.5 * u * u); }
    },
    plateau(xa, xb, level, ramp) {
      const r = Math.max(1e-6, Math.min(ramp, (xb - xa) / 3));
      for (let i = 0; i < NS; i++) {
        const x = cellX(i);
        if (x < xa || x > xb) continue;
        const sh = x < xa + r ? (x - xa) / r : x > xb - r ? (xb - x) / r : 1;
        prof[i] += (level - prof[i]) * sh;
      }
    },
  };
  if (paint) paint(t, P.lenIn);
  const obj = {
    format: PJ.FORMAT, formatVersion: PJ.FORMAT_VERSION, app: pkg.version, name, savedAt: '2026-11-01T00:00:00.000Z',
    params: P,
    profile: { cells: NS, runs: PJ.encodeProfile(prof) },
    elements,
    ...(view ? { view } : {}),
    example: { category, order, note, author, ...(isDefault ? { default: true } : {}) },
  };
  const file = path.join(OUT, `${String(order).padStart(2, '0')}-${slug}.json`);
  fs.writeFileSync(file, JSON.stringify(obj, null, 1) + '\n');
  console.log('wrote', path.relative(process.cwd(), file));
}

for (const f of fs.readdirSync(OUT)) if (/^\d\d-.*\.json$/.test(f)) fs.unlinkSync(path.join(OUT, f));

/* ---------------- Basics ---------------- */
example({
  slug: 'clean-line', order: 10, category: 'Basics', name: 'Clean 50 Ω line',
  note: 'A matched, lossy 2 in stripline and nothing else. S11 stays far down, and all of the insertion loss is conductor and dielectric loss: the power plot shows it as absorbed, not reflected.',
});
example({
  slug: 'impedance-tolerance', order: 11, category: 'Basics', name: '45 Ω trace (impedance tolerance)',
  note: 'The whole trace is 10% low. The TDR reads 45 Ω, and S11 ripples with nulls every 1/(2τ) ≈ 1.6 GHz, where τ is the one-way delay. Change the Length and watch the ripple spacing follow.',
  paint: (t) => t.fill(45),
});
example({
  slug: 'painted-taper', order: 12, category: 'Basics', name: 'Painted taper 50 → 40 → 50 Ω',
  note: 'Gradual transitions reflect much less at high frequency than abrupt ones. Store it with Data → Memory, then use Plateau with a small Brush size to paint the same 40 Ω dip with sharp edges, and compare S11 above a few GHz.',
  paint: (t) => t.plateau(0.4, 1.6, 40, 0.4),
});
example({
  slug: 'lossy-creep', order: 13, category: 'Basics', name: 'Lossy creep on a 10 in line',
  note: 'The painted line is flat, yet the TDR climbs along it: series resistance from skin effect adds up with distance, so a lossy line looks like a rising impedance. Tick Lossless in the Conductor panel and the climb disappears.',
  params: { lenIn: 10 },
});

/* ---------------- Discontinuities ---------------- */
example({
  slug: 'shunt-c-series-l', order: 20, category: 'Discontinuities', name: 'Shunt C and series L',
  note: 'Capacitance pulls the TDR down and inductance pushes it up. The area of each feature gives its value: C = −(2/Z₀)∫ρ dt and L = 2Z₀∫ρ dt over round-trip time. Drag either chip and watch the S11 ripple pattern change.',
  elements: [C(0.6, 0.1), L(1.4, 0.25)],
});
example({
  slug: 'via-stub', order: 21, category: 'Discontinuities', name: 'Via stub resonance, 60 mil',
  note: 'An open 60 mil stub notches S21 near v/(4ℓ) ≈ 27 GHz, yet the TDR shows only a modest dip. Select the S chip and drag Stub length: the notch moves while the TDR barely changes. Back-drilling shortens exactly this stub.',
  elements: [C(1.0, 0.08), STUB(1.0, 60, 45)],
});
example({
  slug: 'compensated-pad', order: 22, category: 'Discontinuities', name: 'Pad compensated with series L',
  note: 'A 0.15 pF pad flanked by two 0.19 nH sections behaves like a short 50 Ω line, because √(L/C) ≈ Z₀. Store it with Data → Memory, then untick Enabled on both L chips to see how much the compensation buys in return loss.',
  elements: [L(0.98, 0.19), C(1.0, 0.15), L(1.02, 0.19)],
});
example({
  slug: 'rx-pad-capacitance', order: 23, category: 'Discontinuities', name: 'Rx pad capacitance, 0.25 pF',
  note: 'A capacitive receiver pad at the far end. Return loss degrades with frequency, and the TDR dips right where the line ends. Try the Rx impedance slider to see a resistive mismatch on top of it.',
  elements: [C(2.0, 0.25)],
});

/* ---------------- TDR artifacts ---------------- */
example({
  slug: 'resolution-two-pads', order: 30, category: 'TDR artifacts', name: 'Resolution: two pads 40 mil apart',
  note: 'Two 0.1 pF pads only 40 mil apart. At f_max 50 GHz the TDR rise time blurs them into one dip. Raise f_max to 110 GHz to separate them, or drop it to 20 GHz to merge them completely. The resolution readout under the plot tracks this.',
  elements: [C(0.98, 0.1), C(1.02, 0.1)],
});
example({
  slug: 'masking', order: 31, category: 'TDR artifacts', name: 'Masking: two identical 30 Ω sections',
  note: 'Both sections are painted at exactly 30 Ω, but the TDR reads the second one higher, because less of the step gets through the first. The bounce between the two sections also shows up later as a small ghost. Loss is off so only masking remains.',
  params: { lossless: true },
  paint: (t) => { t.plateau(0.4, 0.6, 30, 0.005); t.plateau(1.2, 1.4, 30, 0.005); },
});
example({
  slug: 'via-stub-ghost', order: 32, category: 'TDR artifacts', name: 'Ghost after a via stub',
  note: 'Look past the via: around 1.8 in the TDR shows an inductive-looking spike, but nothing is painted there. It is the via’s reflection bouncing off the capacitive pad at 0.5 in and coming back, so it lands about 2 × (1.1 − 0.5) in after the via. Remove the pad and the spike disappears.',
  params: { lenIn: 2.5 },
  elements: [C(0.5, 0.25), C(1.1, 0.08), STUB(1.1, 60, 45)],
});

/* ---------------- Realistic channels ---------------- */
example({
  slug: 'board-launch-via', order: 40, category: 'Realistic channels', name: 'Board launch + via stub', isDefault: true,
  note: 'Connector launches at both ends (capacitive pad, then inductive pin) and a via with a 60 mil stub in the middle. A typical first look at a channel: the stub dominates S21 near 27 GHz, the launches set the return loss.',
  paint: (t, len) => { t.bump(0.07, 0.06, -8); t.bump(0.16, 0.05, 7); t.bump(len - 0.07, 0.06, -8); t.bump(len - 0.16, 0.05, 7); },
  elements: [C(1.0, 0.08), STUB(1.0, 60, 45)],
});
example({
  slug: 'serpentine-corners', order: 41, category: 'Realistic channels', name: 'Serpentine, 5 in, corner capacitance',
  note: 'A 5 in trace with 13 U-turns, each made of two 90° corners of about 0.012 pF. One corner is negligible, but at a regular 0.3 in pitch they add up near v/(2p) ≈ 11 GHz and its harmonics; look at S11 and ILD there. This 1-D model leaves out coupling between the parallel runs, which in a real serpentine shortens the delay.',
  params: { lenIn: 5 },
  elements: [C(0.6, 0.012, { count: 13, pitch: 0.3 }), C(0.62, 0.012, { count: 13, pitch: 0.3 })],
});
/* ---------------- Probing ----------------
 * A GSG probe seen from its calibrated tips, landed on the short of a cal substrate or on a 42 Ω microstrip.
 * Contact values: 30 mΩ is a good landing (FormFactor, InfinityXT data sheet INFINITYXT-DS-0820: typical contact
 * resistance < 0.05 Ω on Al pads, < 0.02 Ω on Au); 2 Ω is a bad one. A lifted ground tip (an unplanarized probe)
 * leaves the return current one ground, which adds loop inductance. 50 pH is an estimate: FormFactor reports about
 * four times the common-mode inductance for SG/GS probes as for GSG (InfLayoutRule-AN-1115, p. 2), and published
 * short models for Cascade probes are 49.8 pH (ACP, GS) and 2.4 pH (HPC, GSG) (Baureis, "Probe tip characterization
 * using self-calibration", FH Würzburg, 2008, slide 10). The 1-D model shows only that loop inductance; the odd modes
 * and radiation a lifted ground also causes are out of its reach.
 * Microstrip: probes need the trace on the surface, so a microstrip, not a stripline. Its field is partly in air:
 * Dk is the quasi-static effective value of a 42 Ω microstrip on Dk 3.35 (Hammerstad's formulas: W/h = 3.04,
 * eps_eff = 2.70), and Df is scaled by the dielectric filling factor (q = 0.90).
 */
const GND_LIFT = 0.05;   // nH, see above
const onShort = (rSig, lGnd) => ({
  params: { lenIn: 1, lossless: true, condLossless: true, dielLossless: true, extremeZ: true, zRx: 0.001, fmaxGHz: 67, beta: 6 },
  paint: (t) => t.plateau(0.5, 1.0, 0.001, 0),
  elements: [...(lGnd ? [L(0.5, lGnd)] : []), R(0.5, rSig)],
  view: { zMin: 0.0005, zMax: 200, log: true },
});
example({
  slug: 'probe-short-good', order: 50, category: 'Probing', name: 'GSG on cal short: good SIG contact (30 mΩ)',
  note: 'A GSG probe landed on the short of a cal substrate, seen from the calibrated tips: a lossless 50 Ω lead, a 30 mΩ signal contact, and the short (a 1 mΩ section into a 1 mΩ Rx). 30 mΩ is a good landing; FormFactor quotes under 50 mΩ on aluminum pads for its InfinityXT probes. On the log axis the TDR falls from 50 Ω to about 30 mΩ and stays there, and |S11| reads about −0.01 dB. Store it with Data → Memory, then open the next two. Uses the experimental impedance range (Settings).',
  ...onShort(0.03, 0),
});
example({
  slug: 'probe-short-bad-sig', order: 51, category: 'Probing', name: 'GSG on cal short: bad SIG contact (2 Ω)',
  note: 'The same short with 2 Ω at the signal tip. The TDR now settles at 2 Ω, almost two decades above a good landing, and |S11| drops to about −0.7 dB. Two resistive ground tips would look the same: a one-port sees one current loop and can’t tell where in it the resistance sits. Set R to 1 MΩ for a tip that never landed.',
  ...onShort(2, 0),
});
example({
  slug: 'probe-short-bad-gnd', order: 52, category: 'Probing', name: 'GSG on cal short: bad GND contact (G lifted)',
  note: 'One ground tip lifted, as with a probe that is not planarized: the return current takes the other ground alone, which adds loop inductance. This example adds 50 pH, an estimate: FormFactor reports about four times the common-mode inductance for GS probes as for GSG, and published short models for Cascade probes are about 50 pH (GS) and 2 pH (GSG). On a short it hides: |S11| stays at 0 dB and the TDR edge moves by about 2 ps. It shows in the phase of S11, about 14° at 20 GHz and 46° at 67 GHz, which this tool does not plot yet.',
  ...onShort(0.03, GND_LIFT),
});
// The microstrip lines carry modest loss so they are not ideal: 0.2 dB/in of conductor loss at 10 GHz, 0.1 Ω/in at DC,
// and the effective Df. These are the values of the lifted-ground case below, set up by Giorgi Maghlakelidze.
const onMicrostrip = (elements) => ({
  params: { lenIn: 1.5, Dk: 2.7, Df: 0.0036, condLoss: 0.2, rdc: 0.1, lossless: false, condLossless: false, dielLossless: false, fmaxGHz: 67 },
  paint: (t) => t.plateau(0.5, 1.0, 42, 0),
  elements,
  view: { zMin: 36, zMax: 54, log: false },
});
example({
  slug: 'probe-ms-good', order: 53, category: 'Probing', name: 'GSG on 42 Ω microstrip: good SIG contact (30 mΩ)',
  note: 'Two GSG probes on 0.5 in of 42 Ω microstrip, seen from the calibrated tips; the 50 Ω sections stand for the probes. A microstrip, not a stripline: a probe needs the trace on the surface. Its field is partly in air, so Dk is the effective 2.70 of a 42 Ω microstrip on Dk 3.35. Both contacts are 30 mΩ. The lines have some loss (0.2 dB/in at 10 GHz, 0.1 Ω/in at DC), so the TDR creeps up a little: the 42 Ω line reads about 42.7 Ω. Pads and ground vias are left out; add a C chip at the tip to see how a launch pad changes the picture. Store it with Data → Memory before opening the next two.',
  ...onMicrostrip([R(0.5, 0.03), R(1.0, 0.03)]),
});
example({
  slug: 'probe-ms-bad-sig', order: 54, category: 'Probing', name: 'GSG on 42 Ω microstrip: bad SIG contact (2 Ω)',
  note: 'The Tx signal tip lands with 2 Ω. The TDR steps up by 2 Ω at the tip and stays up, so the line reads about 44.6 Ω instead of 42.7 Ω: a bad contact quietly shifts every impedance behind it. |S11| even improves by about 1.5 dB, because the line now looks closer to 50 Ω, so a better return loss is no proof of a good landing. S11 and S22 no longer agree.',
  ...onMicrostrip([R(0.5, 2), R(1.0, 0.03)]),
});
// Set up by Giorgi Maghlakelidze to match a TDR he measured with a lifted ground tip: a peak in the middle of the
// 50 to 42 Ω transition. 70 pH placed 35 mil past the tip reproduces it.
example({
  slug: 'probe-ms-bad-gnd', order: 55, category: 'Probing', name: 'GSG on 42 Ω microstrip: bad GND contact (G lifted)',
  author: 'Giorgi Maghlakelidze',
  note: 'Set up by Giorgi Maghlakelidze to match a TDR he measured with a lifted ground tip: a peak in the middle of the 50 to 42 Ω transition. Here 70 pH, 35 mil past the tip, reproduces it. The edge levels off near 47 Ω, peaks at about 48.3 Ω where a good landing already reads 43 Ω, then drops to the line. |S11| is about 0.7 dB worse at 20 GHz and 11 dB worse at 67 GHz. Drag the L chip along the line to see the peak follow it. A real lifted ground also excites unwanted modes and radiates, which this 1-D model leaves out.',
  ...onMicrostrip([L(0.535, 0.07), R(0.5, 0.03), R(1.0, 0.03)]),
});
