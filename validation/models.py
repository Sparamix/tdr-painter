"""Independent scikit-rf models of TDR Painter structures.

A Structure is a physical description: line sections (uniform or linearly tapered), lumped elements and open
stubs at positions along the line, and the line/material/sweep parameters. From it this module builds

  * a scikit-rf Network, using skrf's DistributedCircuit (RLGC) lines, skrf's own Djordjevic-Sarkar
    permittivity (DefinedAEpTandZ0, model='djordjevicsvensson'), skrf tees/opens for stubs, skrf lumped
    elements, and skrf renormalization to the port impedances; and
  * a TDR Painter project file (the same JSON the page saves and opens).

The physics model is the one TDR Painter documents (README, "How it works"); everything that turns that model
into S-parameters and a TDR is skrf's code here and TDR Painter's code in the engine, written independently.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import skrf as rf
from skrf.media import DefinedAEpTandZ0, DefinedGammaZ0, DistributedCircuit

C0 = 299792458.0
IN = 0.0254
MIL = 1e-3 * IN
NS = 500  # cells in a TDR Painter profile

# TDR Painter defaults (src/project.js). Every project written here lists all of them explicitly.
DEFAULTS = dict(lenIn=2, z0=50, Dk=3.35, Df=0.004, frefGHz=12, dsLowHz=1e3, dsHighHz=1e12,
                condLoss=0.4, condRefGHz=10, rdc=0.2, fmaxGHz=50, nf=1001,
                zTx=50, zRx=50, beta=4.2, lossless=False, condLossless=False, dielLossless=False, extremeZ=False)
WIDE = (0.001, 1e6)      # the experimental range (params.extremeZ): shorts and opens
NORMAL_Z = (5, 200)


@dataclass
class Structure:
    """sections: (length_in, Z) uniform, or (length_in, Z_start, Z_end) linear taper, from x = 0.
    elements: dicts in TDR Painter form, e.g. {'type': 'C', 'x': 1.0, 'value': 0.1} (pF, nH, ohm) or
    {'type': 'stub', 'x': 1.0, 'stubZ': 45, 'stubLen': 60} (ohm, mil), with 'end': 'short' for a shorted stub;
    optional 'count' and 'pitch' (in)."""
    params: dict
    sections: list
    elements: list = field(default_factory=list)

    def __post_init__(self):
        self.params = {**DEFAULTS, **self.params}
        P = self.params      # as project.js normalizeLoss: lossless means both, and follows the two parts
        if P['lossless']:
            P['condLossless'] = P['dielLossless'] = True
        P['lossless'] = bool(P['condLossless'] and P['dielLossless'])
        total = sum(s[0] for s in self.sections)
        if abs(total - self.params['lenIn']) > 1e-9:
            raise ValueError(f'sections add up to {total} in, lenIn is {self.params["lenIn"]}')
        self.dx = self.params['lenIn'] / NS
        for x in self.boundaries() + [x for x, _ in self.expanded_elements()]:
            if abs(x / self.dx - round(x / self.dx)) > 1e-6:
                raise ValueError(f'{x} in is not on a cell boundary (cell = {self.dx} in)')

    def boundaries(self):
        xs, x = [], 0.0
        for s in self.sections:
            x += s[0]
            xs.append(round(x, 12))
        return xs

    def expanded_elements(self):
        """(x, element) for every copy, in TDR Painter's order: by position, then by list order."""
        out = []
        for i, e in enumerate(self.elements):
            if e.get('enabled', True) is False:
                continue
            for k in range(int(e.get('count', 1))):
                x = round(e['x'] + k * e.get('pitch', 0.15), 12)
                if x <= self.params['lenIn'] + 1e-9:
                    out.append((x, i, k, e))
        out.sort(key=lambda t: (round(t[0] / self.dx), t[1], t[2]))
        return [(x, e) for x, _, _, e in out]

    def z_at(self, x):
        """Painted impedance at position x (inches); tapers are linear in x."""
        x0 = 0.0
        for s in self.sections:
            if x <= x0 + s[0] + 1e-12:
                if len(s) == 2:
                    return s[1]
                return s[1] + (s[2] - s[1]) * (x - x0) / s[0]
            x0 += s[0]
        s = self.sections[-1]
        return s[-1]

    def profile(self):
        """The 500-cell painted profile: impedance at each cell centre."""
        return np.array([self.z_at((i + 0.5) * self.dx) for i in range(NS)])

    # ---------------------------------------------------------------- TDR Painter project
    def project(self, name, note=''):
        prof = self.profile()
        runs = []
        i = 0
        while i < NS:
            z = quant_z(prof[i])
            j = i + 1
            while j < NS and quant_z(prof[j]) == z:
                j += 1
            runs.append([z, j - i])
            i = j
        elements = []
        for e in self.elements:
            o = {'type': e['type'], 'x': e['x'], 'count': int(e.get('count', 1)), 'pitch': e.get('pitch', 0.15), 'locked': False,
                 'enabled': e.get('enabled', True) is not False}
            if e['type'] == 'stub':
                o.update(stubZ=e['stubZ'], stubLen=e['stubLen'], value=0, end=e.get('end', 'open'))
            else:
                o['value'] = e['value']
            elements.append(o)
        doc = {'format': 'tdr-painter-project', 'formatVersion': 1, 'app': 'validation', 'name': name,
               'savedAt': '2026-11-07T00:00:00.000Z', 'params': dict(self.params),
               'profile': {'cells': NS, 'runs': runs}, 'elements': elements}
        if note:
            doc['example'] = {'category': 'Community', 'note': note, 'author': 'TDR Painter validation'}
        return doc

    # ---------------------------------------------------------------- scikit-rf network
    def permittivity(self, freq, constant_df=False):
        P = self.params
        if P['dielLossless'] or P['Df'] <= 0:
            return np.full(freq.npoints, complex(P['Dk']))
        if constant_df:   # frequency-independent Dk and Df: the classic non-causal model (negative control only)
            return np.full(freq.npoints, complex(P['Dk'], -P['Dk'] * P['Df']))
        m = DefinedAEpTandZ0(freq, ep_r=P['Dk'], tanD=P['Df'], f_ep=P['frefGHz'] * 1e9,
                             f_low=P['dsLowHz'], f_high=P['dsHighHz'], model='djordjevicsvensson')
        return np.asarray(m.ep_r_f)

    def media(self, freq, z, eps, causal_conductor=True):
        """RLGC line of nominal impedance z (ohm) as documented in the README: R' and L' scale with z,
        C' and G' with 1/z; conductor (1+j)K*sqrt(f) plus Rdc; dielectric from complex permittivity."""
        P = self.params
        f = freq.f
        w = 2 * np.pi * f
        sq = math.sqrt(P['Dk'])
        if P['condLossless']:
            kc = rdcN = 0.0
        else:
            alpha_c = P['condLoss'] / 8.685889638 / IN          # Np/m of the nominal line at condRef
            kc = 2 * alpha_c / math.sqrt(P['condRefGHz'] * 1e9)
            rdcN = P['rdc'] / IN / P['z0']                       # ohm/m per ohm of line impedance
        R = z * (rdcN + kc * np.sqrt(f))
        L = z * (sq / C0 + (kc * np.sqrt(f) / w if causal_conductor else 0.0))
        C = eps.real / (C0 * sq * z)
        G = -w * eps.imag / (C0 * sq * z)
        return DistributedCircuit(freq, z0_port=50, C=C, L=L, R=R, G=G)

    def network(self, freq, sub=1, causal_conductor=True, constant_df=False):
        """skrf Network on `freq` (f > 0). Taper sections are split into `sub` pieces per painted cell
        (sub=1 reproduces the painted cells; larger values approach the continuous taper).
        causal_conductor=False and constant_df=True build deliberately non-causal lines (negative controls)."""
        eps = self.permittivity(freq, constant_df)
        lumped = DefinedGammaZ0(freq, z0=50)
        cache = {}

        def med(z):
            key = round(float(z), 9)
            if key not in cache:
                cache[key] = self.media(freq, key, eps, causal_conductor)
            return cache[key]

        # pieces of line between events (section boundaries and element positions)
        pieces = []          # (x_start, x_end, z) uniform pieces
        x0 = 0.0
        for s in self.sections:
            x1 = x0 + s[0]
            if len(s) == 2:
                pieces.append((x0, x1, s[1]))
            else:
                n = int(round(s[0] / self.dx)) * sub
                for k in range(n):
                    a = x0 + s[0] * k / n
                    b = x0 + s[0] * (k + 1) / n
                    pieces.append((a, b, s[1] + (s[2] - s[1]) * (k + 0.5) / n))
            x0 = x1
        events = self.expanded_elements()
        chain = []
        ei = 0
        for a, b, z in pieces:
            while ei < len(events) and events[ei][0] <= a + 1e-12:
                chain.append(self._element(events[ei][1], lumped, med, freq))
                ei += 1
            # split the piece at any element strictly inside it
            cur = a
            while ei < len(events) and events[ei][0] < b - 1e-12:
                xe = events[ei][0]
                chain.append(med(z).line((xe - cur) * IN, 'm'))
                while ei < len(events) and abs(events[ei][0] - xe) < 1e-12:
                    chain.append(self._element(events[ei][1], lumped, med, freq))
                    ei += 1
                cur = xe
            chain.append(med(z).line((b - cur) * IN, 'm'))
        while ei < len(events):
            chain.append(self._element(events[ei][1], lumped, med, freq))
            ei += 1
        ntw = rf.network.cascade_list(chain)
        ntw.renormalize([self.params['zTx'], self.params['zRx']])
        return ntw

    def _element(self, e, lumped, med, freq):
        t = e['type']
        if t == 'C':
            return lumped.shunt_capacitor(e['value'] * 1e-12)
        if t == 'L':
            return lumped.inductor(e['value'] * 1e-9)
        if t == 'R':
            return lumped.resistor(e['value'])
        if t == 'stub':
            if e.get('end') == 'short':
                return med(e['stubZ']).shunt_delay_short(e['stubLen'] * MIL, 'm')
            return med(e['stubZ']).shunt_delay_open(e['stubLen'] * MIL, 'm')
        raise ValueError(t)

    # ---------------------------------------------------------------- analytic DC
    def dc_sparams(self):
        """Exact S11, S21 at DC for the painted structure: lines are series Rdc, C and open stubs are open,
        L is a short, R is R, and a shorted stub is its own DC resistance to ground (as in the engine, a lossless
        one is 1e-15 ohm). Computed as a real ABCD cascade."""
        P = self.params
        rdcn = 0.0 if P['condLossless'] else P['rdc'] / P['z0']          # ohm per inch per ohm of line impedance
        A, B, C, D = 1.0, 0.0, 0.0, 1.0

        def series(r):
            nonlocal B, D
            B += A * r
            D += C * r

        def shunt(g):
            nonlocal A, C
            A += B * g
            C += D * g
        events = self.expanded_elements()
        prof = self.profile()
        ei = 0
        for i in range(NS + 1):
            while ei < len(events) and round(events[ei][0] / self.dx) == i:
                e = events[ei][1]
                if e['type'] == 'R':
                    series(e['value'])
                elif e['type'] == 'stub' and e.get('end') == 'short':
                    shunt(1.0 / max(e['stubZ'] * rdcn / IN * (e['stubLen'] * MIL), 1e-15))
                ei += 1
            if i < NS:
                series(prof[i] * rdcn * self.dx)
        z1, z2 = P['zTx'], P['zRx']
        den = A * z2 + B + C * z1 * z2 + D * z1
        return (A * z2 + B - C * z1 * z2 - D * z1) / den, 2 * math.sqrt(z1 * z2) / den


def quant_z(z):
    """Impedance as TDR Painter stores it (project.js quantZ): 1 mohm steps from 1 ohm, 4 significant digits below."""
    z = float(z)
    return round(z, 3) if z >= 1 else float(f'{z:.4g}')


def frequency(params, include_dc=False):
    """TDR Painter's grid: nf points from DC to fmax (skrf networks use the points above DC)."""
    f = np.linspace(0, params['fmaxGHz'] * 1e9, params['nf'])
    return rf.Frequency.from_f(f if include_dc else f[1:], unit='hz')


def skrf_tdr(ntw, z_tx, beta, n_samples=8191):
    """TDR as a scikit-rf user would compute it: extrapolate S11 to DC (linear), Kaiser-windowed step
    response. Returns time (s), rho, impedance."""
    s11 = ntw.s11.extrapolate_to_dc(kind='linear')
    pad = (n_samples + 1) // 2 - len(s11)
    t, y = s11.step_response(window=('kaiser', beta), pad=pad)
    return t, y, z_tx * (1 + y) / (1 - y)


def profile_project(params, prof, name):
    """A TDR Painter project from a raw 500-cell profile (no elements), e.g. a profile painted from a TDR."""
    st = Structure(dict(params, lenIn=params['lenIn']), [(params['lenIn'], 50.0)])
    doc = st.project(name)
    runs, i = [], 0
    prof = np.clip(np.asarray(prof, dtype=float), *(WIDE if params.get('extremeZ') else NORMAL_Z))
    while i < NS:
        z = quant_z(prof[i])
        j = i + 1
        while j < NS and quant_z(prof[j]) == z:
            j += 1
        runs.append([z, j - i])
        i = j
    doc['profile'] = {'cells': NS, 'runs': runs}
    doc['elements'] = []
    return doc


def paint_from_tdr(t, z, v_ref, len_in):
    """What a person painting the TDR trace would draw: the TDR impedance at each cell centre, with time
    mapped to distance at the line's nominal velocity (x = v t / 2), exactly like the page's distance axis."""
    x_tdr = np.asarray(t) * v_ref / 2 / IN
    xc = (np.arange(NS) + 0.5) * len_in / NS
    return np.interp(xc, x_tdr, np.asarray(z).real)
