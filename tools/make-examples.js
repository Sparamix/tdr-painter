#!/usr/bin/env node
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

function example({ slug, order, category, name, note, params = {}, paint, elements = [], view = null, isDefault = false }) {
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
    example: { category, order, note, author: 'TDR Painter', ...(isDefault ? { default: true } : {}) },
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
const probe = (tipR) => ({
  params: { lenIn: 1.56 },
  paint: (t) => t.plateau(0.53, 1.03, 42, 0.004),
  elements: [R(0.5, tipR), L(0.5, 0.12), C(0.52, 0.06), C(1.04, 0.06), L(1.06, 0.12), R(1.06, 0.02)],
});
example({
  slug: 'probe-good-contact', order: 41, category: 'Realistic channels', name: 'Probes on 42 Ω stripline, good contact',
  note: '50 Ω coax (the first and last 0.5 in), an inductive probe tip (0.12 nH), a capacitive pad (0.06 pF), 0.5 in of 42 Ω stripline, then the same in reverse. Tip and pad partly cancel; the 42 Ω section sets the low-frequency ripple. Both contacts are 0.02 Ω. Try 0.25 nH tips to see a spring-probe fixture.',
  ...probe(0.02),
});
example({
  slug: 'probe-bad-contact', order: 42, category: 'Realistic channels', name: 'Probes on 42 Ω stripline, bad Tx contact',
  note: 'Same fixture, but the Tx probe lands with 3 Ω of contact resistance. The TDR steps up by about 3 Ω at the tip and stays up to DC, so the 42 Ω stripline now reads about 46 Ω instead of 43 Ω: a bad contact quietly corrupts every impedance behind it. S11 also no longer matches S22.',
  ...probe(3),
});
example({
  slug: 'serpentine-corners', order: 43, category: 'Realistic channels', name: 'Serpentine, 5 in, corner capacitance',
  note: 'A 5 in trace with 13 U-turns, each made of two 90° corners of about 0.012 pF. One corner is negligible, but at a regular 0.3 in pitch they add up near v/(2p) ≈ 11 GHz and its harmonics; look at S11 and ILD there. This 1-D model leaves out coupling between the parallel runs, which in a real serpentine shortens the delay.',
  params: { lenIn: 5 },
  elements: [C(0.6, 0.012, { count: 13, pitch: 0.3 }), C(0.62, 0.012, { count: 13, pitch: 0.3 })],
});
// A GSG probe on the short of a cal substrate, from the calibrated tips (experimental impedance range, log axis).
const onShort = (rContact) => ({
  params: { lenIn: 1, lossless: true, extremeZ: true, zRx: 0.001, fmaxGHz: 67, beta: 6 },
  paint: (t) => t.plateau(0.5, 1.0, 0.001, 0),
  elements: [L(0.5, 0.02), R(0.5, rContact)],
  view: { zMin: 0.0005, zMax: 200, log: true },
});
example({
  slug: 'probe-short-good', order: 44, category: 'Realistic channels', name: 'GSG probe on a short, good contact',
  note: 'A probe landed on the short of a cal substrate, seen from the calibrated tips: a lossless 50 Ω lead, 20 pH of tip and strip inductance, a 30 mΩ contact, and the short (a 1 mΩ section into a 1 mΩ Rx). On the log axis the TDR drops from 50 Ω to about 30 mΩ and stays there; on a linear axis it is just zero. Kaiser β 6 keeps the window ringing near ±4 mΩ. Store it with Data → Memory, then open the bad-contact example. Uses the experimental impedance range (gear menu).',
  ...onShort(0.03),
});
example({
  slug: 'probe-short-bad', order: 45, category: 'Realistic channels', name: 'GSG probe on a short, bad contact',
  note: 'The same short with a 0.5 Ω contact. The TDR after the short sits at 0.5 Ω, more than a decade above a good landing, and |S11| reads about −0.17 dB instead of 0 dB. A bad signal tip and two bad ground tips look alike: both put resistance in the one current loop, so a one-port can’t tell which. One lifted ground mostly adds inductance (the grounds were in parallel); raise the L chip and the edge barely moves. Set R to 1 MΩ for a probe that never landed.',
  ...onShort(0.5),
});
