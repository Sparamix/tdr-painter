#!/usr/bin/env python3
"""Verify TDR Painter against scikit-rf.

    python validation/run_validation.py            # full run, about a minute
    python validation/run_validation.py --quick    # skip the 10x-finer TDR reference

Writes validation/cases (TDR Painter projects), validation/reference (scikit-rf Touchstone files) and
validation/report (REPORT.md, figures, results.json). Exits with status 1 if any pass/fail check fails.
Needs Node 18+ and Python 3.10+ with validation/requirements.txt (tested with scikit-rf 2.2).
"""
from __future__ import annotations

import argparse
import datetime
import json
import math
import pathlib
import platform
import re
import subprocess
import sys
import tempfile
import warnings

import numpy as np
import skrf as rf
from scipy.integrate import cumulative_trapezoid
from scipy.special import i0

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
from models import (C0, IN, MIL, NS, Structure, frequency, paint_from_tdr,  # noqa: E402
                    profile_project, skrf_tdr)
import microstrip  # noqa: E402

warnings.filterwarnings('ignore', message=".*Frequency doesn't begin from 0.*")

# ------------------------------------------------------------------------------------------------ limits
LIM = dict(
    sparam=1e-9,          # Tier A: |S_engine - S_skrf|, complex, same structure
    fine_s21_db=0.02,     # Tier A: 500-cell taper vs 10x finer taper, |delta S21| dB
    fine_s11=0.005,       # Tier A: same, |delta S11| linear
    tdr_rho=1e-3,         # Tier B: engine TDR vs skrf impulse response, same DC and integration start
    tdr_truth=3e-3,       # Tier B: engine TDR vs 10x-finer-grid TDR (time aliasing of slow loss tails)
    passive=1e-12,        # largest singular value of S minus 1
    energy=1e-12,         # lossless: | |S11|^2 + |S21|^2 - 1 |
    dc=1e-12,             # S at DC vs closed form
    causal=3e-4,          # S21 impulse before the light-speed front, relative to its peak
)
PAINT_S21_DB, PAINT_S11 = 0.5, 0.05   # Tier C agreement band: |dS21| <= 0.5 dB and | |S11| - |S11ref| | <= 0.05

# ------------------------------------------------------------------------------------------------ colours
COL = dict(ref='#aab1be', refl='#eb6834', trans='#2a78d6', port2='#1baf7a', ink='#26318a', text='#3c4352',
           muted='#788092', grid='#e6e9ee', warn='#b4322a')
plt.rcParams.update({
    'font.size': 9, 'axes.edgecolor': '#c9ced8', 'axes.labelcolor': COL['text'], 'xtick.color': COL['muted'],
    'ytick.color': COL['muted'], 'axes.titlesize': 10, 'axes.titleweight': 'bold', 'axes.titlecolor': COL['text'],
    'axes.grid': True, 'grid.color': COL['grid'], 'grid.linewidth': 0.8, 'legend.frameon': True, 'legend.framealpha': 0.88, 'legend.edgecolor': 'none',
    'legend.fontsize': 8, 'figure.dpi': 110, 'savefig.dpi': 150, 'axes.spines.top': False, 'axes.spines.right': False,
})


# ================================================================================================ cases
def cases():
    """The five synthetic structures. Positions sit on TDR Painter's cell boundaries (lenIn / 500)."""
    beatty = Structure(dict(lenIn=2.5), [(0.75, 50), (1.0, 25), (0.75, 50)])
    via = Structure(dict(lenIn=2.0), [(0.98, 50), (0.04, 38), (0.98, 50)],
                    [dict(type='C', x=0.98, value=0.06), dict(type='stub', x=1.02, stubZ=45, stubLen=60)])
    periodic = Structure(dict(lenIn=4.0), [(4.0, 50)], [dict(type='C', x=0.48, value=0.1, count=10, pitch=0.32)])

    def probe(r_tx, z_rx=50):
        return Structure(dict(lenIn=2.0, zRx=z_rx), [(0.62, 50), (0.76, 42), (0.62, 50)],
                         [dict(type='R', x=0.6, value=r_tx), dict(type='L', x=0.6, value=0.12),
                          dict(type='C', x=0.62, value=0.06), dict(type='C', x=1.38, value=0.06),
                          dict(type='L', x=1.4, value=0.12), dict(type='R', x=1.4, value=0.02)])
    taper = Structure(dict(lenIn=10.0), [(2, 50), (2, 50, 40), (2, 40), (2, 40, 50), (2, 50)])

    v = C0 / math.sqrt(3.35)
    f_quarter = v / (4 * 60 * MIL)            # open-stub quarter-wave frequency, lossless
    k = 537                                   # put grid point 537 exactly on it (fmax = 50.03 GHz)

    return [
        dict(slug='beatty', title='Beatty standard: 25 Ω section in a 50 Ω line',
             what='A 1 in, 25 Ω section between 0.75 in leads of 50 Ω stripline. The stepped-impedance airline '
                  'used in VNA verification kits, here as a stripline.',
             variants=[('lossy', beatty), ('lossless', lossless(beatty))], analytic=check_beatty),
        dict(slug='via-stub', title='Via transition with a 60 mil open stub',
             what='50 Ω stripline into a via: 0.06 pF of pad capacitance, a 40 mil, 38 Ω barrel, and a 60 mil, '
                  '45 Ω open stub hanging off its far end, then 50 Ω stripline out.',
             variants=[('lossy', via), ('lossless, grid point on the quarter-wave',
                                        lossless(via, fmaxGHz=f_quarter * 1000 / k / 1e9))],
             analytic=lambda st, r: check_stub(st, r, f_quarter, k)),
        dict(slug='periodic-c', title='Periodic shunt capacitance: 10 × 0.1 pF at 0.32 in',
             what='A 4 in, 50 Ω line loaded with ten 0.1 pF shunt capacitors every 0.32 in, like vias or '
                  'connector pins along a bus. Periodic loading opens a stopband near v/(2p).',
             variants=[('lossy', periodic), ('lossless', lossless(periodic))], analytic=check_bloch),
        dict(slug='probe-launch', title='Probe launch: series R and L, pad C, 42 Ω stripline',
             what='50 Ω coax, a probe tip (contact R plus 0.12 nH), a 0.06 pF pad, 0.76 in of 42 Ω stripline, '
                  'and the mirror image. Good contact (0.02 Ω), bad Tx contact (3 Ω), and the bad contact into a '
                  '75 Ω receiver to exercise unequal port impedances.',
             variants=[('good contact', probe(0.02)), ('bad contact, 3 Ω', probe(3.0)),
                       ('bad contact, 75 Ω receiver', probe(3.0, 75))], analytic=None, show=1),
        dict(slug='lossy-taper', title='10 in lossy line with a 50 → 40 → 50 Ω linear taper',
             what='Two 2 in linear tapers around a 2 in, 40 Ω section on a 10 in line. Exercises the loss model, '
                  'the TDR on a long lossy line, and how well 500 painted cells approximate a continuous taper.',
             variants=[('lossy', taper), ('lossless', lossless(taper))], analytic=None, fine=True),
    ]


def lossless(st, **over):
    return Structure({**st.params, 'lossless': True, **over}, st.sections, st.elements)


# ================================================================================================ engine
def run_engine(jobs):
    with tempfile.TemporaryDirectory() as d:
        p = pathlib.Path(d) / 'jobs.json'
        p.write_text(json.dumps(jobs))
        out = subprocess.run(['node', str(HERE / 'engine_runner.js'), str(p)], capture_output=True, text=True)
    if out.returncode:
        raise RuntimeError(out.stderr)
    res = {}
    for r in json.loads(out.stdout):
        S = lambda a: np.array(r[a + 'r']) + 1j * np.array(r[a + 'i'])  # noqa: E731
        res[r['id']] = dict(f=np.array(r['f']), s11=S('s11'), s21=S('s21'), s22=S('s22'), vRef=r['vRef'],
                            rise=r['riseTime'], epsInf=r['epsInf'], clamped=r['clamped'],
                            t=np.array(r['tdr']['t']), rho=np.array(r['tdr']['rho']),
                            x=np.array(r['tdr']['x']), z=np.array(r['tdr']['z']), profile=np.array(r['profile']))
    return res


# ================================================================================================ helpers
def kaiser_half(n, beta):
    return i0(beta * np.sqrt(np.clip(1 - (np.arange(n) / (n - 1)) ** 2, 0, None))) / i0(beta)


def step_np(s, df, beta, t_start, nn):
    """Kaiser-windowed step response of S (DC first), integrated by the trapezoid rule from t_start."""
    h = np.fft.fftshift(np.fft.irfft(s * kaiser_half(len(s), beta), n=nn))
    t = (np.arange(nn) - nn // 2) / (nn * df)
    k0 = int(np.searchsorted(t, t_start))
    y = np.zeros(nn)
    y[k0:] = cumulative_trapezoid(h[k0:], initial=0)
    return t, y


def skrf_step_same_dc(ntw, s11_dc, beta, t_start, n_samples=8191):
    """skrf's own windowed impulse response of S11, with the exact DC value, integrated from t_start."""
    s11 = ntw.s11.extrapolate_to_dc(dc_sparam=np.array([[s11_dc]]))
    t, h = s11.impulse_response(window=('kaiser', beta), pad=(n_samples + 1) // 2 - len(s11), bandpass=False)
    k0 = int(np.searchsorted(t, t_start))
    y = np.zeros(len(t))
    y[k0:] = cumulative_trapezoid(h[k0:], initial=0)
    return t, y


def db(x):
    return 20 * np.log10(np.maximum(np.abs(x), 1e-15))


def sigma_max(s11, s21, s22):
    S = np.stack([np.stack([s11, s21], -1), np.stack([s21, s22], -1)], -2)
    return np.linalg.svd(S, compute_uv=False)[:, 0]


def precursor(f, s21, length_in, eps_inf, beta=10):
    """Largest |S21 impulse| more than 4 rise times before the light-speed front, relative to the peak."""
    df = f[1] - f[0]
    nn = 2 * 16384 - 1
    h = np.fft.fftshift(np.fft.irfft(s21 * kaiser_half(len(f), beta), n=nn))
    t = (np.arange(nn) - nn // 2) / (nn * df)
    one = np.fft.fftshift(np.fft.irfft(kaiser_half(len(f), beta), n=nn)).cumsum()
    tr = np.interp(0.9, one, t) - np.interp(0.1, one, t)
    front = length_in * IN * math.sqrt(eps_inf) / C0
    pre = (t > -1e-9) & (t < front - 4 * tr)
    return float(np.abs(h[pre]).max() / np.abs(h).max())


def agree_band(f, s11a, s21a, s11b, s21b):
    """First frequency where |dS21| > 0.5 dB or | |S11a| - |S11b| | > 0.05 (None: agrees across the band)."""
    bad = (np.abs(db(s21a) - db(s21b)) > PAINT_S21_DB) | (np.abs(np.abs(s11a) - np.abs(s11b)) > PAINT_S11)
    bad[0] = False
    i = np.argmax(bad)
    return float(f[i]) if bad[i] else None


def check(name, value, limit, kind='max', fmt='{:.1e}', tier=''):
    ok = value <= limit if kind == 'max' else value >= limit
    return dict(name=name, value=float(value), limit=float(limit), ok=bool(ok), fmt=fmt, tier=tier)


def info(name, text, tier='C'):
    return dict(name=name, text=text, ok=None, tier=tier)


# ================================================================================================ analytic
def check_beatty(st, r):
    """Lossless closed form: matched leads of electrical length t1, section t2 with reflection G."""
    P = st.params
    if not P['lossless']:
        return []
    f = r['f']
    beta = 2 * np.pi * f * math.sqrt(P['Dk']) / C0
    t1, t2 = beta * 0.75 * IN, beta * 1.0 * IN
    G = (25 - 50) / (25 + 50)
    den = 1 - G ** 2 * np.exp(-2j * t2)
    s11 = np.exp(-2j * t1) * G * (1 - np.exp(-2j * t2)) / den
    s21 = np.exp(-1j * (2 * t1 + t2)) * (1 - G ** 2) / den
    err = max(np.abs(r['s11'] - s11).max(), np.abs(r['s21'] - s21).max())
    peak = float(np.abs(r['s11']).max())
    f_peak = C0 / math.sqrt(P['Dk']) / (4 * 1.0 * IN)
    return [check('closed-form S11, S21 (max |error|)', err, 1e-9, tier='X'),
            check(f'peak |S11| = 2|Γ|/(1+Γ²) = 0.6 (first peak {f_peak/1e9:.2f} GHz)', abs(peak - 0.6), 1e-3, fmt='{:.1e}', tier='X')]


def check_stub(st, r, f_q, k):
    if not st.params['lossless']:
        return []
    s21 = abs(r['s21'][k])
    return [check(f'|S21| at the stub quarter-wave v/(4ℓ) = {f_q/1e9:.3f} GHz (grid point {k})', s21, 1e-9, tier='X')]


def bloch_stopband(st):
    """First stopband of the infinite lossless periodic line: cos(βd) = cos(kd) − (ωCZ0/2) sin(kd)."""
    e = st.elements[0]
    d, C, Z0 = e['pitch'] * IN, e['value'] * 1e-12, st.params['z0']
    f = np.linspace(1e9, 25e9, 240001)
    kd = 2 * np.pi * f * math.sqrt(st.params['Dk']) / C0 * d
    rhs = np.cos(kd) - (2 * np.pi * f * C * Z0 / 2) * np.sin(kd)
    stop = np.abs(rhs) > 1
    i0_ = np.argmax(stop)
    i1 = i0_ + np.argmax(~stop[i0_:])
    return f[i0_], f[i1 - 1]


def d_pitch(st):
    return st.elements[0]['pitch'] * IN


def check_bloch(st, r):
    if not st.params['lossless']:
        return []
    lo, hi = bloch_stopband(st)
    f = r['f']
    f_bragg = C0 / math.sqrt(st.params['Dk']) / (2 * d_pitch(st))
    band = (f > 0.5 * f_bragg) & (f < 1.5 * f_bragg)      # around the first Bragg frequency v / (2p)
    f_min = f[band][np.argmin(np.abs(r['s21'][band]))]
    mid = (f >= lo) & (f <= hi)
    inside = float(np.abs(r['s21'][mid]).max())
    outside = float(np.abs(r['s21'][(f > 1e9) & (f < 0.8 * lo)]).min())
    return [check(f'S21 minimum ({f_min/1e9:.2f} GHz) lies in the Bloch stopband {lo/1e9:.2f} to {hi/1e9:.2f} GHz '
                  '(0 = yes)', 0 if lo <= f_min <= hi else 1, 0, fmt='{:.0f}', tier='X'),
            check('largest |S21| inside the stopband, below the smallest |S21| in the passband under 0.8 × its edge '
                  f'({outside:.2f})', inside, outside, fmt='{:.2f}', tier='X')]


# ================================================================================================ one case
def run_case(case, quick):
    slug = case['slug']
    variants = case['variants']
    jobs = [dict(id=f'{slug}/{i}', project=st.project(f'{case["title"]} ({name})'), tdrSpanIn=1.25 * st.params['lenIn'])
            for i, (name, st) in enumerate(variants)]
    eng = run_engine(jobs)
    rows = []
    store = {}
    for i, (name, st) in enumerate(variants):
        r = eng[f'{slug}/{i}']
        P = st.params
        checks = []
        if r['clamped']:
            checks.append(dict(name='project within the page’s limits', ok=False, text='; '.join(r['clamped']), tier='A'))
        freq = frequency(P)
        ntw = st.network(freq)
        f = r['f']
        # ---- Tier A: S-parameters, same structure
        for nm, (a, b) in (('S11', (0, 0)), ('S21', (1, 0)), ('S22', (1, 1))):
            key = nm.lower()
            checks.append(check(f'{nm}: max |engine − scikit-rf|', np.abs(r[key][1:] - ntw.s[:, a, b]).max(), LIM['sparam'], tier='A'))
        checks.append(check('scikit-rf reference is reciprocal: max |S12 − S21|', np.abs(ntw.s[:, 0, 1] - ntw.s[:, 1, 0]).max(), 1e-10, tier='A'))
        if case.get('fine') and i == 0:
            fine = st.network(freq, sub=10)
            d21 = np.abs(db(r['s21'][1:]) - db(fine.s[:, 1, 0])).max()
            d11 = np.abs(r['s11'][1:] - fine.s[:, 0, 0]).max()
            checks.append(check('500 painted cells vs 10× finer taper: max |ΔS21| (dB)', d21, LIM['fine_s21_db'], fmt='{:.4f}', tier='A'))
            checks.append(check('500 painted cells vs 10× finer taper: max |ΔS11|', d11, LIM['fine_s11'], fmt='{:.4f}', tier='A'))
        # ---- physics
        s11dc, s21dc = st.dc_sparams()
        checks.append(check('DC: |S11(0) − closed form|, |S21(0) − closed form|',
                            max(abs(r['s11'][0] - s11dc), abs(r['s21'][0] - s21dc)), LIM['dc'], tier='P'))
        checks.append(check('passivity: max singular value of S − 1', sigma_max(r['s11'], r['s21'], r['s22']).max() - 1,
                            LIM['passive'], tier='P'))
        has_r = any(e['type'] == 'R' for e in st.elements)
        if P['lossless'] and not has_r:
            e1 = np.abs(np.abs(r['s11']) ** 2 + np.abs(r['s21']) ** 2 - 1).max()
            e2 = np.abs(np.abs(r['s22']) ** 2 + np.abs(r['s21']) ** 2 - 1).max()
            checks.append(check('lossless energy: max | |S11|² + |S21|² − 1 | (both ports)', max(e1, e2), LIM['energy'], tier='P'))
        checks.append(check('causality: S21 impulse before the light-speed front / peak',
                            precursor(f, r['s21'], P['lenIn'], r['epsInf']), LIM['causal'], tier='P'))
        if case.get('analytic'):
            checks += case['analytic'](st, r)
        # ---- Tier B: TDR
        span = (r['t'] > -0.1e-9) & (r['t'] < 2 * 1.1 * P['lenIn'] * IN / r['vRef'])
        t0 = -r['t'][0]
        ts, ys = skrf_step_same_dc(ntw, s11dc, P['beta'], -t0)
        checks.append(check('TDR: max |ρ engine − ρ scikit-rf| (exact DC, same integration start)',
                            np.abs(np.interp(r['t'][span], ts, ys) - r['rho'][span]).max(), LIM['tdr_rho'], tier='B'))
        tu, yu, zu = skrf_tdr(ntw, P['zTx'], P['beta'])
        user = np.abs(np.interp(r['t'][span], tu, yu) - r['rho'][span]).max()
        truth_note, truth = '', None
        if not quick and not P['lossless']:
            f10 = np.linspace(0, P['fmaxGHz'] * 1e9, 10 * (P['nf'] - 1) + 1)
            n10 = st.network(rf.Frequency.from_f(f10[1:], unit='hz'))
            tt, yt = step_np(np.concatenate([[s11dc], n10.s[:, 0, 0]]), f10[1], P['beta'], -t0, 2 * 65536 - 1)
            truth = np.interp(r['t'][span], tt, yt)
            e_eng = np.abs(r['rho'][span] - truth).max()
            e_usr = np.abs(np.interp(r['t'][span], tu, yu) - truth).max()
            checks.append(check('TDR: max |ρ engine − ρ on a 10× finer frequency grid|', e_eng, LIM['tdr_truth'], tier='B'))
            truth_note = f'; on the 10× finer grid, scikit-rf’s step_response is off by {e_usr:.1e}'
            truth = dict(engine=float(e_eng), skrf_step_response=float(e_usr))
        checks.append(info('TDR: scikit-rf step_response as a user runs it (linear DC extrapolation)',
                           f'max |Δρ| vs engine {user:.1e}{truth_note}', tier='B'))
        rows.append(dict(variant=name, params=P, checks=checks, user=float(user), truth=truth))
        store[name] = dict(st=st, r=r, ntw=ntw, tu=tu, zu=zu)

    # ---- Tier C: paint the TDR trace, simulate, compare (first variant)
    name0, st0 = variants[case.get('show', 0)]
    P0 = st0.params
    r0 = store[name0]['r']
    ntw0 = store[name0]['ntw']
    painted = {}
    for label, fmax in (('50 GHz TDR', P0['fmaxGHz']), ('110 GHz TDR', 110)):
        if fmax == P0['fmaxGHz']:
            tu, zu = store[name0]['tu'], store[name0]['zu']
        else:
            ntw_hi = st0.network(frequency({**P0, 'fmaxGHz': fmax}))
            tu, _, zu = skrf_tdr(ntw_hi, P0['zTx'], P0['beta'])
        prof = paint_from_tdr(tu, zu, C0 / math.sqrt(P0['Dk']), P0['lenIn'])
        painted[label] = dict(prof=prof, project=profile_project(P0, prof, f'{case["title"]}, painted from its {label}'))
    eng_p = run_engine([dict(id=k, project=v['project']) for k, v in painted.items()])
    c_rows = []
    for label in painted:
        rp = eng_p[label]
        fa = agree_band(rp['f'][1:], rp['s11'][1:], rp['s21'][1:], ntw0.s[:, 0, 0], ntw0.s[:, 1, 0])
        low = rp['f'][1:] <= 10e9
        c_rows.append(dict(source=label, agree_to=fa,
                           max_ds21_db_10g=float(np.abs(db(rp['s21'][1:]) - db(ntw0.s[:, 1, 0]))[low].max()),
                           max_ds21_db=float(np.abs(db(rp['s21'][1:]) - db(ntw0.s[:, 1, 0])).max()),
                           dc_s21_db=(float(db(rp['s21'][0])), float(db(r0['s21'][0])))))
        painted[label]['r'] = rp
    return dict(case=case, rows=rows, store=store, painted=painted, c_rows=c_rows)


# ================================================================================================ figures
def element_ticks(ax, st, y):
    for x, e in st.expanded_elements():
        ax.plot([x, x], [y[0], y[1]], color=COL['muted'], lw=1)
    xs = [x for x, _ in st.expanded_elements()]
    if xs:
        ax.plot([], [], color=COL['muted'], lw=1, label='lumped element / stub position')


def figure_case(res, path):
    case = res['case']
    name0, st0 = case['variants'][case.get('show', 0)]
    d = res['store'][name0]
    r, ntw, P = d['r'], d['ntw'], st0.params
    paint = res['painted']['50 GHz TDR']
    f = r['f'][1:] / 1e9
    fig = plt.figure(figsize=(12, 7.6))
    gs = fig.add_gridspec(2, 3, height_ratios=[1.05, 1], hspace=0.38, wspace=0.28)
    ax = fig.add_subplot(gs[0, :])
    xprof = np.repeat(np.linspace(0, P['lenIn'], NS + 1), 2)[1:-1]
    ax.plot(xprof, np.repeat(r['profile'], 2), color=COL['ink'], lw=1.6, label='painted profile Z(x) (the model)')
    xu = d['tu'] * r['vRef'] / 2 / IN
    ax.plot(xu, d['zu'].real, color=COL['ref'], lw=5, alpha=0.75, solid_capstyle='round', label=f'scikit-rf TDR (Kaiser β {P["beta"]})')
    ax.plot(r['x'], r['z'], color=COL['refl'], lw=1.3, label='TDR Painter TDR')
    lo = min(r['profile'].min(), np.nanmin(r['z'])) - 3
    hi = max(r['profile'].max(), np.nanmax(r['z'])) + 3
    element_ticks(ax, st0, (lo + 0.5, lo + 2))
    ax.set_xlim(-0.05 * P['lenIn'], 1.15 * P['lenIn'])
    ax.set_ylim(lo, hi)
    ax.set_xlabel('distance (in), x = v·t/2 at the nominal Dk')
    ax.set_ylabel('impedance (Ω)')
    ax.set_title(f'{case["title"]}: impedance and TDR ({name0}, f_max {P["fmaxGHz"]:g} GHz)', loc='left')
    ax.legend(loc='upper right', ncol=4)

    rp = paint['r']
    for k, (key, colr, title) in enumerate((('s11', COL['refl'], '|S11| (dB)'), ('s21', COL['trans'], '|S21| (dB)'))):
        a = fig.add_subplot(gs[1, k])
        ref = ntw.s[:, 0, 0] if key == 's11' else ntw.s[:, 1, 0]
        a.plot(f, db(ref), color=COL['ref'], lw=4.5, alpha=0.75, label='scikit-rf')
        a.plot(f, db(r[key][1:]), color=colr, lw=1.2, label='TDR Painter')
        a.plot(f, db(rp[key][1:]), color=COL['ink'], lw=1.1, ls=(0, (4, 2.5)), label='painted from the TDR trace')
        a.set_xlabel('frequency (GHz)')
        a.set_title(title, loc='left')
        if key == 's11':
            a.set_ylim(max(-70, db(ref).min() - 5), 3)
        a.legend(loc='lower left' if key == 's21' else 'lower right')
    a = fig.add_subplot(gs[1, 2])
    for key, colr, (i, j) in (('s11', COL['refl'], (0, 0)), ('s21', COL['trans'], (1, 0)), ('s22', COL['port2'], (1, 1))):
        a.semilogy(f, np.maximum(np.abs(r[key][1:] - ntw.s[:, i, j]), 1e-17), color=colr, lw=1, label=key.upper())
    a.axhline(LIM['sparam'], color=COL['warn'], lw=1, ls=(0, (3, 2)), label=f'limit {LIM["sparam"]:.0e}')
    a.set_ylim(1e-17, 1e-6)
    a.set_xlabel('frequency (GHz)')
    a.set_title('|TDR Painter − scikit-rf| (complex)', loc='left')
    a.legend(loc='upper left', ncol=2)
    fig.savefig(path, bbox_inches='tight')
    plt.close(fig)


# ================================================================================================ report
def ghz(x):
    return 'whole band' if x is None else f'{x/1e9:.1f} GHz'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--quick', action='store_true', help='skip the 10x-finer TDR reference')
    args = ap.parse_args()
    for d in ('cases', 'reference', 'report/figures'):
        (HERE / d).mkdir(parents=True, exist_ok=True)

    results, all_checks = [], []
    for case in cases():
        print(f'… {case["slug"]}', flush=True)
        res = run_case(case, args.quick)
        results.append(res)
        for row in res['rows']:
            all_checks += row['checks']
        st0 = case['variants'][0][1]
        (HERE / 'cases' / f'{case["slug"]}.json').write_text(json.dumps(st0.project(case['title'], case['what']), indent=1) + '\n')
        for vi, (vname, st) in enumerate(case['variants'][1:], 1):
            (HERE / 'cases' / f'{case["slug"]}--{slugify(vname)}.json').write_text(
                json.dumps(st.project(f'{case["title"]} ({vname})', case['what']), indent=1) + '\n')
        ntw = res['store'][case['variants'][0][0]]['ntw']
        ntw.write_touchstone(str(HERE / 'reference' / case['slug']), skrf_comment=False, form='ri')
        figure_case(res, HERE / 'report' / 'figures' / f'{case["slug"]}.png')

    print('… causality negative controls', flush=True)
    neg = negative_controls()
    all_checks += neg['checks']
    print('… scikit-rf examples (microstrip)', flush=True)
    ms = microstrip.run(HERE, run_engine, COL, LIM)
    all_checks += ms['checks']

    failed = [c for c in all_checks if c.get('ok') is False]
    write_report(results, neg, ms, failed)
    (HERE / 'report' / 'results.json').write_text(json.dumps(summary_json(results, neg, ms), indent=1) + '\n')
    n_pass = sum(1 for c in all_checks if c.get('ok') is True)
    print(f'{n_pass} checks passed, {len(failed)} failed')
    for c in failed:
        print('FAIL', c['name'], c.get('value', c.get('text')))
    return 1 if failed else 0


def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def negative_controls():
    """The causality check must fail for line models known to be non-causal."""
    st = Structure(dict(lenIn=10.0), [(10.0, 50)])
    freq = frequency(st.params)
    f = np.concatenate([[0], freq.f])
    eng = run_engine([dict(id='line', project=st.project('10 in line'))])['line']
    s21dc = st.dc_sparams()[1]
    rows = [('TDR Painter (Djordjevic-Sarkar dielectric, (1+j)√f conductor)', eng['s21'], eng['epsInf'], True)]
    for label, kw in (('constant Dk and Df at every frequency', dict(constant_df=True)),
                      ('skin-effect resistance without its internal inductance', dict(causal_conductor=False))):
        n = st.network(freq, **kw)
        rows.append((label, np.concatenate([[s21dc], n.s[:, 1, 0]]), eng['epsInf'], False))
    checks, table = [], []
    for label, s21, epsinf, should_pass in rows:
        v = precursor(f, s21, 10.0, epsinf)
        ok = (v <= LIM['causal']) == should_pass
        checks.append(dict(name=f'negative control: {label}', value=v, limit=LIM['causal'], ok=ok, fmt='{:.1e}', tier='P'))
        table.append((label, v, should_pass, ok))
    return dict(checks=checks, table=table)


def summary_json(results, neg, ms):
    def clean(c):
        return {k: v for k, v in c.items() if k != 'fmt'}
    return dict(
        generated=datetime.date.today().isoformat(), versions=versions(), limits=LIM,
        cases=[dict(slug=r['case']['slug'], title=r['case']['title'],
                    variants=[dict(variant=row['variant'], checks=[clean(c) for c in row['checks']]) for row in r['rows']],
                    paint_round_trip=r['c_rows']) for r in results],
        causality_negative_controls=[dict(model=l, precursor=v, expected_to_pass=s, ok=o) for l, v, s, o in neg['table']],
        scikit_rf_examples=ms['json'])


def versions():
    pkg = json.loads((ROOT / 'package.json').read_text())
    node = subprocess.run(['node', '--version'], capture_output=True, text=True).stdout.strip()
    import scipy
    return {'tdr-painter': pkg['version'], 'scikit-rf': rf.__version__, 'numpy': np.__version__, 'scipy': scipy.__version__,
            'python': platform.python_version(), 'node': node}


def write_report(results, neg, ms, failed):
    V = versions()
    L = []
    w = L.append
    w('# TDR Painter verification report\n')
    w(f'Generated {datetime.date.today().isoformat()} by `validation/run_validation.py` with TDR Painter {V["tdr-painter"]}, '
      f'scikit-rf {V["scikit-rf"]}, NumPy {V["numpy"]}, SciPy {V["scipy"]}, Python {V["python"]} and Node {V["node"]}. '
      'Rerun the script to regenerate this file; do not edit it by hand.\n')
    n_ok = sum(1 for r in results for row in r['rows'] for c in row['checks'] if c.get('ok') is True) \
        + sum(1 for c in neg['checks'] if c['ok']) + sum(1 for c in ms['checks'] if c.get('ok') is True)
    w(f'**Result: {"all pass/fail checks passed" if not failed else f"{len(failed)} check(s) FAILED"}** ({n_ok} passed).\n')
    w('## What is checked\n')
    w('TDR Painter computes S-parameters from the painted impedance profile and the lumped elements (an exact cascade), '
      'then derives the TDR from S11. Each structure below is built twice, independently: once as a TDR Painter project '
      '(simulated by the page’s own `src/engine.js`) and once in scikit-rf from the same physical description '
      '(RLGC `DistributedCircuit` lines, scikit-rf’s Djordjevic-Svensson permittivity, tees and opens for stubs, lumped elements, '
      'renormalization to the port impedances).\n')
    w(tr('Tier', 'Question', 'Pass/fail'))
    w('| --- | --- | --- |')
    w(tr('A', 'Same structure, same S-parameters?', f'max complex difference ≤ {LIM["sparam"]:.0e}'))
    w(tr('B', 'Same TDR as scikit-rf’s windowed step response?', f'max |Δρ| ≤ {LIM["tdr_rho"]:.0e} (≈ 0.1 Ω at 50 Ω)'))
    w(tr('P', 'Physics: DC limit, passivity, energy conservation when lossless, causality', 'see each table'))
    w(tr('X', 'Textbook results: Beatty closed form, quarter-wave stub null, Bloch stopband', 'see each table'))
    w(tr('C', 'If you paint the TDR trace you see, how close are the S-parameters?',
         f'informational: band where |ΔS21| ≤ {PAINT_S21_DB} dB and abs(Δ|S11|) ≤ {PAINT_S11}'))
    w(tr('R', 'How close to a measurement and a commercial solver (cases from scikit-rf’s documentation)?', 'informational'))
    w('')
    w('## Summary\n')
    w(tr('Case', 'A: max |ΔS|', 'B: max |Δρ|', 'P and X', 'C: paint the 50 GHz TDR', 'C: paint a 110 GHz TDR'))
    w('| --- | --- | --- | --- | --- | --- |')
    for r in results:
        cs = [c for row in r['rows'] for c in row['checks']]
        a = max(c['value'] for c in cs if c['tier'] == 'A' and 'max |engine − scikit-rf|' in c['name'])
        b = max(c['value'] for c in cs if c['tier'] == 'B' and c.get('ok') is not None and 'same integration' in c['name'])
        px = [c for c in cs if c['tier'] in ('P', 'X') and c.get('ok') is not None]
        okpx = sum(c['ok'] for c in px)
        c50, c110 = r['c_rows']
        w(tr(f'[{r["case"]["title"]}](#{anchor(r["case"]["title"])})', f'{a:.0e}', f'{b:.0e}', f'{okpx}/{len(px)} pass',
             f'agrees to {ghz(c50["agree_to"])}', f'agrees to {ghz(c110["agree_to"])}'))
    w('')
    sm = ms['json']['stepped_microstrip']['comparison']
    tp = ms['json']['taper']
    w(f'Tier R, against the outside world: on the [measured stepped microstrip](#stepped-impedance-microstrip-measured) '
      f'TDR Painter’s TDR is within {sm[0]["tdr_max_ohm"]:.1f} Ω of the measurement (scikit-rf’s own MLine model: '
      f'{sm[1]["tdr_max_ohm"]:.1f} Ω); on the [microstrip tapers](#microstrip-taper-into-15-ω-ansys-circuit) its |S11| is '
      f'within {max(v["tdr_painter"] for v in tp.values()):.3f} of ANSYS Circuit (scikit-rf’s MLine: '
      f'{max(v["skrf"] for v in tp.values()):.3f}).\n')
    w(findings(results))
    for r in results:
        case = r['case']
        w(f'## {case["title"]}\n')
        w(case['what'] + '\n')
        w(f'![{case["title"]}](figures/{case["slug"]}.png)\n')
        w(f'Project files: [`cases/{case["slug"]}.json`](../cases/{case["slug"]}.json) (opens in TDR Painter), '
          'plus one per variant. '
          f'scikit-rf reference: [`reference/{case["slug"]}.s2p`](../reference/{case["slug"]}.s2p).\n')
        for row in r['rows']:
            w(f'**{row["variant"][0].upper() + row["variant"][1:]}**\n')
            w(tr('Tier', 'Check', 'Value', 'Limit', 'Result'))
            w('| --- | --- | --- | --- | --- |')
            for c in row['checks']:
                if c.get('ok') is None:
                    w(tr(c['tier'], c['name'], c['text'], '', 'info'))
                elif 'value' not in c:
                    w(tr(c['tier'], c['name'], c.get('text', ''), '', '**FAIL**'))
                else:
                    w(tr(c['tier'], c['name'], c['fmt'].format(c['value']), c['fmt'].format(c['limit']),
                         'pass' if c['ok'] else '**FAIL**'))
            w('')
        w('**Paint the TDR, then simulate (tier C)**\n')
        w(tr('Painted from', 'Agrees to', 'max |ΔS21| up to 10 GHz', 'max |ΔS21| to f_max', 'S21 at DC, painted vs real'))
        w('| --- | --- | --- | --- | --- |')
        for c in r['c_rows']:
            w(tr(f'scikit-rf {c["source"]}', ghz(c['agree_to']), f'{c["max_ds21_db_10g"]:.2f} dB', f'{c["max_ds21_db"]:.1f} dB',
                 f'{c["dc_s21_db"][0]:.3f} vs {c["dc_s21_db"][1]:.3f} dB'))
        w('')
        w(NOTES.get(case['slug'], '') + '\n')
    w('## Causality: the check catches non-causal models\n')
    w('Djordjevic et al. showed that a dielectric with frequency-independent Dk and Df is not causal; the same holds for '
      'skin-effect resistance without its internal inductance. Each makes S21 respond before the light-speed front '
      '(set by the permittivity at infinite frequency). The check measures the largest impulse-response sample more than '
      f'four rise times (Kaiser β 10) before that front, relative to the peak, on a 10 in line. Limit {LIM["causal"]:.0e}.\n')
    w(tr('Line model', 'Precursor / peak', 'Expected', 'Result'))
    w('| --- | --- | --- | --- |')
    for label, v, should, ok in neg['table']:
        w(tr(label, f'{v:.1e}', 'causal (pass)' if should else 'non-causal (flagged)', 'as expected' if ok else '**UNEXPECTED**'))
    w('')
    w(ms['markdown'])
    w(LIMITS_TEXT)
    w('## References\n')
    w(REFERENCES)
    (HERE / 'report' / 'REPORT.md').write_text('\n'.join(L) + '\n')


def tr(*cells):
    """A Markdown table row; pipes inside cells are escaped."""
    return '| ' + ' | '.join(str(c).replace('|', '\\|') for c in cells) + ' |'


def anchor(title):
    s = ''.join(ch for ch in title.lower() if ch.isalnum() or ch in ' -').replace(' ', '-')
    return s


def findings(results):
    rows = [row for r in results for row in r['rows']]
    tdr_b = max(c['value'] for row in rows for c in row['checks'] if c['tier'] == 'B' and 'same integration' in c['name'])
    a_max = max(c['value'] for row in rows for c in row['checks'] if c['tier'] == 'A' and 'max |engine − scikit-rf|' in c['name'])
    lossy = [(r['case']['title'], row) for r in results for row in r['rows'] if not row['params']['lossless']]
    worst = max(lossy, key=lambda t: t[1]['user'])
    tr_rows = [row for _, row in lossy if row['truth']]
    if tr_rows:
        eng = max(row['truth']['engine'] for row in tr_rows)
        usr = max(row['truth']['skrf_step_response'] for row in tr_rows)
        truth_txt = (f'Against a reference computed on a 10× finer frequency grid (no wrap-around to speak of), TDR Painter '
                     f'is within {eng:.0e} on every lossy case and scikit-rf’s `step_response` within {usr:.0e}. ')
    else:
        truth_txt = '(The 10× finer-grid reference was skipped in this run, `--quick`.) '
    return f"""## Findings

1. **Engine and scikit-rf agree to round-off.** For every structure and variant, S11, S21 and S22 from TDR Painter match
   scikit-rf to {a_max:.0e} or better, across lossy lines, tapers, stubs, lumped R, L and C, and unequal port impedances.
2. **Fixed by this work: the TDR was drawn half a sample (1.2 ps) early.** The engine integrated the impulse response
   with a running sum; scikit-rf uses the trapezoid rule. The engine now uses the trapezoid rule as well, and places
   t = 0 on a sample so that both tools sample the same instants. With the v0.5.0 engine the TDR differed from
   scikit-rf by up to 0.029 in ρ (about 3 Ω at 50 Ω) on sharp edges; now the largest difference over all cases is
   {tdr_b:.0e}, the size of a one-bin difference in how the two tools define the Kaiser window’s edge.
3. **scikit-rf’s `step_response` sits slightly off on lossy lines.** It extrapolates S11 to DC linearly and integrates
   from half a record (1/(2Δf)) before t = 0, so the slow conductor-loss tail that wraps around the record turns into
   a small offset. Run that way, it differs from TDR Painter by up to {worst[1]['user']:.0e} in ρ (on the
   {worst[0][0].lower() + worst[0][1:]}). {truth_txt}For lossless structures the two agree. The tier B pass/fail
   check therefore compares like with like (same DC value, same integration start), and the as-a-user comparison is
   listed for information.
4. **Painting the TDR is a good model only where the TDR resolves the structure.** Tier C shows how far you get by
   tracing the TDR you see into a profile. It works for smooth features much longer than the rise time (the 10 in
   taper agrees over the whole band) and fails for what a 1-D impedance profile cannot hold or the TDR blurs: a
   shunt stub’s resonance, the loss of a series resistor, closely spaced lumped elements, and the downstream
   impedance after a large step, which the TDR shows shifted by multiple reflections.
"""


NOTES = {
    'beatty': 'The painted-from-TDR model gets the 25 Ω plateau right, but the line after the section comes out at '
              'about 46 to 48 Ω instead of 50 Ω: past a large step the TDR still carries the two-way transmission '
              'through it and the multiple reflections inside the section, and painting takes both for impedance. '
              'The edge blur and the conductor-loss creep get painted too. S21 stays close at low frequency, while '
              'the S11 ripple pattern drifts as frequency rises.',
    'via-stub': 'The stub’s quarter-wave notch near 27 GHz cannot come from painting the TDR: a shunt resonator has no '
                'equivalent in a series impedance profile at this resolution, and its TDR signature is only a dip and '
                'some ringing. This is why TDR Painter has a separate stub element.',
    'periodic-c': 'At 50 GHz each 0.1 pF capacitor shows up as a dip about as wide as the rise time, and the dips shrink '
                  'along the line. Painted that way, the first S11 peak stays near v/(2p) ≈ 10 GHz, but it is weaker, '
                  'S21 barely dips there, and the higher stopbands are gone: a blurred dip has lost the high-frequency '
                  'content a point capacitor scatters. Lumped elements belong in the element tools, not in the paint.',
    'probe-launch': 'Shown and painted here: the bad contact. A series resistor raises the TDR by about R for everything '
                    'behind it, so painting the TDR turns the 3 Ω contact into a 3 Ω rise of the rest of the line. That '
                    'reflects but does not dissipate, so the painted model misses the resistor’s insertion loss, '
                    'including at DC (S21 column above), even though its TDR looks the same. The tip inductance and pad '
                    'capacitance are below the 50 GHz resolution and come out as small smoothed bumps.',
    'lossy-taper': 'Long, smooth tapers are where painting works best: the features are far wider than the TDR’s '
                   'spatial resolution. The remaining error comes from the conductor-loss creep on the 10 in line, '
                   'which the painted profile takes for a slowly rising impedance.',
}

LIMITS_TEXT = """## Limits of this verification

- **Verification, not validation against hardware.** Tiers A and B prove the code computes what TDR Painter’s model says.
  Whether that model fits a given board is a separate question; the scikit-rf measurement case above is one data point.
- **Shared model assumptions.** Both builds use the same documented RLGC scaling (R′ and L′ ∝ Z, C′ ∝ 1/Z), so a wrong
  assumption there would not show up in tier A. The physics checks (causality, passivity, energy, DC, textbook
  results) and the scikit-rf examples are the guard against that.
- **1-D TEM only.** Neither build includes coupling, radiation, mode conversion or microstrip dispersion.
"""

REFERENCES = """- A. R. Djordjevic, R. M. Biljic, V. D. Likar-Smiljanic, T. K. Sarkar, “Wideband frequency-domain characterization of FR-4 and time-domain causality,” IEEE Trans. Electromagn. Compat., vol. 43, no. 4, pp. 662–667, Nov. 2001, [doi:10.1109/15.974647](https://doi.org/10.1109/15.974647).
- D. M. Pozar, *Microwave Engineering*, 4th ed., Wiley, 2012, Sec. 8.1 (periodic structures, Bloch impedance and stopbands).
- scikit-rf documentation: [`Network.step_response`](https://scikit-rf.readthedocs.io/en/latest/api/generated/skrf.network.Network.step_response.html), [Time domain reflectometry, measurement vs simulation](https://scikit-rf.readthedocs.io/en/latest/examples/networktheory/Time%20domain%20reflectometry%2C%20measurement%20vs%20simulation.html), [Tapered transmission lines](https://scikit-rf.readthedocs.io/en/latest/examples/taper/tapered_transmission_lines.html).
- Anritsu VectorStar verification kit components (stepped-impedance “Beatty” standard): [MS4640A manual, ch. 11](https://dl.cdn-anritsu.com/en-us/test-measurement/ohs/10450-00008L/Calibration_and_Measurement/MG_Ch11_VerificationTools.12.3.html).
"""

if __name__ == '__main__':
    sys.exit(main())
