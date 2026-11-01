"""Cross-check the JS engine against scikit-rf's Djordjevic-Svensson media.

Builds the same structure in both (50-ohm line with a 42-ohm section and a 0.15 pF shunt C,
Megtron 6 R-5775(N) dielectric, no conductor loss) and compares S11/S21.

    pip install scikit-rf
    python test/skrf_crosscheck.py
"""
import json
import pathlib
import subprocess
import sys

import numpy as np
import skrf as rf
from skrf.media import DefinedAEpTandZ0

ROOT = pathlib.Path(__file__).resolve().parents[1]
JS = r"""
const E = require(process.argv[1]);
const P = { lenIn: 2, z0: 50, Dk: 3.35, Df: 0.004, frefGHz: 12, dsLowHz: 1e3, dsHighHz: 1e12, condLoss: 0, condRefGHz: 10,
            rdc: 0, fmaxGHz: 50, nf: 1001, zTx: 50, zRx: 50, beta: 4.2, lossless: false };
const prep = E.prepare(P);
const prof = new Float64Array(500).fill(50);
for (let i = 100; i < 150; i++) prof[i] = 42;
const s = E.solve(prep, E.buildCascade(prof, [{ id: 1, type: 'C', x: 1.4, value: 0.15, count: 1, pitch: 0 }], P));
const ds = E.makeDS(3.35, 0.004, 12e9, 1e3, 1e12);
console.log(JSON.stringify({ f: Array.from(prep.f), s11r: Array.from(s.s11r), s11i: Array.from(s.s11i),
  s21r: Array.from(s.s21r), s21i: Array.from(s.s21i), eps: [1e9, 12e9, 40e9].map(f => ds.eps(f)) }));
"""

out = subprocess.run(["node", "-e", JS, str(ROOT / "src" / "engine.js")], capture_output=True, text=True, check=True)
d = json.loads(out.stdout)
f = np.array(d["f"])
f[0] = 1e3  # skrf media needs f > 0
freq = rf.Frequency.from_f(f, unit="hz")
IN = 0.0254


def med(z):
    return DefinedAEpTandZ0(freq, ep_r=3.35, tanD=0.004, f_ep=12e9, f_low=1e3, f_high=1e12,
                            z0=z, z0_port=50, model="djordjevicsvensson")


m50, m42 = med(50), med(42)
cell = 2 * IN / 500
ntw = (m50.line(100 * cell, "m") ** m42.line(50 * cell, "m") ** m50.line(200 * cell, "m")
       ** m50.shunt_capacitor(0.15e-12) ** m50.line(150 * cell, "m"))

eps_skrf = [complex(np.interp(x, f, m50.ep_r_f.real) + 1j * np.interp(x, f, m50.ep_r_f.imag)) for x in (1e9, 12e9, 40e9)]
eps_js = [complex(a, b) for a, b in d["eps"]]
eps_err = max(abs(a - b) for a, b in zip(eps_skrf, eps_js))

s11 = np.array(d["s11r"]) + 1j * np.array(d["s11i"])
s21 = np.array(d["s21r"]) + 1j * np.array(d["s21i"])
k = slice(1, None)
db = lambda x: 20 * np.log10(np.abs(x))
e11 = np.max(np.abs(s11[k] - ntw.s[k, 0, 0]))  # linear: dB is ill-conditioned in the S11 nulls
e21 = np.max(np.abs(db(s21[k]) - db(ntw.s[k, 1, 0])))
print(f"permittivity max |diff|: {eps_err:.2e}")
print(f"max |S11 diff| (linear): {e11:.4f}   max |dB(S21) diff|: {e21:.4f} dB")
# skrf keeps C real and puts loss in G, while the engine uses complex eps in C, so a small gap is expected.
ok = eps_err < 1e-9 and e21 < 0.05 and e11 < 0.01
print("PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
