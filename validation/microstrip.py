"""Two cases taken from scikit-rf's documentation, rebuilt in TDR Painter.

1. Stepped-impedance microstrip, measured on an Anritsu VNA and simulated with scikit-rf's MLine
   ("Time domain reflectometry, measurement vs simulation").
2. Microstrip taper into a 15 ohm load, simulated with ANSYS Circuit and scikit-rf's MLine
   ("Tapered transmission lines").

The data is vendored in third_party/scikit-rf (BSD-3-Clause; see the README there). TDR Painter has no microstrip
model: it takes one impedance and one delay per section and a single Dk. So each section is painted with the
impedance scikit-rf's MLine gives for its width, and with the length that gives it MLine's delay at the
project's Dk. Values are taken at mid-band (f_max / 2). These cases check that the whole chain (painted profile,
loss model, S-parameters, TDR) lands where measurement and other solvers do; they cannot be exact, because
TDR Painter leaves out microstrip dispersion, width-dependent loss and conductor roughness.
"""
from __future__ import annotations

import math
import pathlib
import warnings

import numpy as np
import skrf as rf
from scipy.optimize import minimize
from skrf.media import MLine, DefinedAEpTandZ0

import matplotlib.pyplot as plt

from models import C0, IN, MIL, NS, Structure, frequency, skrf_tdr

warnings.filterwarnings('ignore', message='.*switch term.*')
warnings.filterwarnings('ignore', message='Conductor loss calculation invalid')   # MLine, below a few hundred MHz
NP_DB = 8.685889638
TP = pathlib.Path(__file__).resolve().parent / 'third_party' / 'scikit-rf'


# ------------------------------------------------------------------------------------------------ helpers
def stack_structure(params, stack):
    """A Structure from [(length_in, Z), ...], with section edges rounded to TDR Painter's 500-cell grid."""
    total = sum(l for l, _ in stack)
    dx = total / NS
    edges = np.round(np.cumsum([l for l, _ in stack]) / dx).astype(int)
    edges[-1] = NS
    sections, prev = [], 0
    for e, (_, z) in zip(edges, stack):
        if e > prev:
            sections.append(((e - prev) * dx, round(float(z), 3)))   # project files store 1 mohm
            prev = e
    return Structure(dict(params, lenIn=total), sections)


def db(x):
    return 20 * np.log10(np.maximum(np.abs(x), 1e-15))


def row(*cells):
    return '| ' + ' | '.join(str(c).replace('|', '\\|') for c in cells) + ' |'


# ================================================================================================ stepped microstrip
W1, H1, T1, RHO1, ROUGH1 = 3.00e-3, 1.55e-3, 50e-6, 1.712e-8, 0.15e-6
F_EP1 = 1e9


def load_measurements():
    d = TP / 'tdr_measurement_vs_simulation'
    meas = {p.stem: rf.Network(str(p)) for p in (d / 'measurement').glob('*.s?p')}
    simu = rf.Network(str(d / 'simulation' / 'P1-MSL_Stepped_140-P2.s2p'))
    return meas, simu


def fit_stepped(meas):
    """The scikit-rf example's own parameter extraction, unchanged except for the decimated data:
    NIST multiline TRL on the 100 and 200 mm lines and the 50 mm shorts gives the effective permittivity and
    loss, fitted with MLine; the connector is a line whose delay and impedance come from the error terms."""
    line100, line200 = meas['P1-MSL_Thru_100-P2'], meas['P1-MSL_Thru_200-P2']
    short = rf.network.two_port_reflect(meas['P1-MSL_Short_50'], meas['P2-MSL_Short_50'])
    cal = rf.calibration.NISTMultilineTRL([line100, short, line200], [-1], [100e-3, 200e-3], er_est=4.5,
                                          refl_offset=[50e-3])
    cal.run()
    freq = line100.frequency
    ep_mea, a_mea = cal.er_eff.real, 20 / math.log(10) * cal.gamma.real

    def cost(x):
        m = mline1(freq, W1, x[0], x[1])
        return np.sum((m.ep_reff_f.real - ep_mea) ** 2) + 0.1 * np.sum((m.alpha * 20 / math.log(10) - a_mea) ** 2)
    ep_r, tand = minimize(cost, [4.5, 0.02], bounds=[(4.0, 5.0), (0.001, 0.1)]).x

    conn = rf.calibration.error_dict_2_network(cal.coefs, cal.frequency, is_reciprocal=True)[0]
    sel = freq.f < 9e9
    delay = -np.polyfit(freq.f[sel], np.angle(conn.s[sel, 1, 0]), 1)[0] / (2 * np.pi)
    mc = DefinedAEpTandZ0(freq, ep_r=1, tanD=0.02, Z0=50, f_low=1e3, f_high=1e18, f_ep=F_EP1, model='frequencyinvariant')

    def cost2(x):
        chk = mc.thru(z0=50.) ** mc.line(delay, 's', z0=x[0]) ** mc.thru(z0=50.)
        return np.sum(np.abs(conn.s[:, 0, 0] - chk.s[:, 0, 0]))
    z_conn = minimize(cost2, [50.], bounds=[(20, 100)]).x[0]
    return dict(ep_r=float(ep_r), tand=float(tand), delay=float(delay), z_conn=float(z_conn))


def mline1(freq, w, ep_r, tand):
    return MLine(frequency=freq, z0_port=50, w=w, h=H1, t=T1, ep_r=ep_r, mu_r=1, rho=RHO1, tand=tand, rough=ROUGH1,
                 f_low=1e3, f_high=1e12, f_epr_tand=F_EP1, diel='djordjevicsvensson', disp='kirschningjansen')


def stepped_structure(fit):
    """Paint the stepped line: connector, 50 mm at 3 mm wide, 20 mm at 8 mm, 20 mm at 1 mm, 50 mm at 3 mm, connector."""
    f_mid = 5e9
    fq = rf.Frequency.from_f([f_mid, 10e9], unit='hz')
    lines = {w: mline1(fq, w, fit['ep_r'], fit['tand']) for w in (3e-3, 8e-3, 1e-3)}
    z = {w: float(m.Z0.real[0]) for w, m in lines.items()}
    er = {w: float(m.ep_reff_f.real[0]) for w, m in lines.items()}
    nom = lines[3e-3]
    dk = er[3e-3]
    df = float(nom.alpha_dielectric[0] * C0 / (math.pi * f_mid * math.sqrt(dk)))   # effective tan(delta) of the 3 mm line
    params = dict(Dk=round(dk, 4), Df=round(df, 5), frefGHz=f_mid / 1e9, dsLowHz=1e3, dsHighHz=1e12,
                  condLoss=round(float(nom.alpha_conductor[1]) * NP_DB * IN, 5), condRefGHz=10,
                  rdc=round(RHO1 / (W1 * T1) * IN, 5), z0=round(z[3e-3], 3), fmaxGHz=10, zTx=50, zRx=50)
    v = C0 / math.sqrt(params['Dk'])
    conn_len = fit['delay'] * v / IN
    sec = [(50e-3, 3e-3), (20e-3, 8e-3), (20e-3, 1e-3), (50e-3, 3e-3)]
    stack = [(conn_len, fit['z_conn'])] + [(L * math.sqrt(er[w] / params['Dk']) / IN, z[w]) for L, w in sec] \
        + [(conn_len, fit['z_conn'])]
    table = [('SMA connector (fitted line)', '', f'{fit["delay"]*1e12:.1f} ps', fit['z_conn'], 1.0, conn_len)] + \
        [(f'{w*1e3:.0f} mm wide', f'{L*1e3:.0f} mm', f'{L*math.sqrt(er[w])/C0*1e12:.0f} ps', z[w], er[w],
          L * math.sqrt(er[w] / params['Dk']) / IN) for L, w in sec] + \
        [('SMA connector (fitted line)', '', f'{fit["delay"]*1e12:.1f} ps', fit['z_conn'], 1.0, conn_len)]
    return stack_structure(params, stack), table


def run_stepped(run_engine, fig_dir, col, lim):
    meas, simu = load_measurements()
    fit = fit_stepped(meas)
    st, table = stepped_structure(fit)
    P = st.params
    project = st.project('Stepped microstrip (scikit-rf TDR example)',
                         'The stepped-impedance microstrip from scikit-rf\'s "Time domain reflectometry, measurement '
                         'vs simulation" example, painted from MLine impedances and delays. Compare with the '
                         'measured TDR in validation/report/REPORT.md.')
    r = run_engine([dict(id='stepped', project=project, tdrSpanIn=1.35 * P['lenIn'])])['stepped']
    ntw = st.network(frequency(P))
    m = meas['P1-MSL_Stepped_140-P2']
    if not np.allclose(m.f, r['f'][1:]):
        raise RuntimeError('measurement grid does not match the TDR Painter grid')
    checks = []
    for nm, key, (i, j) in (('S11', 's11', (0, 0)), ('S21', 's21', (1, 0))):
        checks.append(dict(tier='A', name=f'painted structure, {nm}: max |engine − scikit-rf|',
                           value=float(np.abs(r[key][1:] - ntw.s[:, i, j]).max()), limit=lim['sparam'], fmt='{:.1e}'))
        checks[-1]['ok'] = checks[-1]['value'] <= lim['sparam']

    beta = P['beta']
    tm, _, zm = skrf_tdr(m, 50, beta)
    ts, _, zs = skrf_tdr(simu, 50, beta)
    t_end = 2 * P['lenIn'] * IN / r['vRef']
    win = (r['t'] > 0) & (r['t'] < t_end + 0.3e-9)
    te = r['t'][win]
    z_meas = np.interp(te, tm, zm.real)
    d_tp = np.abs(r['z'][win] - z_meas)
    d_sk = np.abs(np.interp(te, ts, zs.real) - z_meas)
    f = r['f'][1:]
    s21m, s11m = m.s[:, 1, 0], m.s[:, 0, 0]
    rows = []
    for label, s11, s21, dz in (('TDR Painter (painted from MLine)', r['s11'][1:], r['s21'][1:], d_tp),
                                ('scikit-rf MLine model (from the example)', simu.s[:, 0, 0], simu.s[:, 1, 0], d_sk)):
        lo = f <= 5e9
        rows.append(dict(model=label, tdr_max_ohm=float(dz.max()), tdr_rms_ohm=float(np.sqrt(np.mean(dz ** 2))),
                         s21_max_db_5g=float(np.abs(db(s21) - db(s21m))[lo].max()),
                         s21_max_db_10g=float(np.abs(db(s21) - db(s21m)).max()),
                         s11_rms_db_5g=float(np.sqrt(np.mean((db(s11) - db(s11m))[lo] ** 2)))))
    for rw in rows:
        checks.append(dict(tier='R', ok=None, name=f'measured stepped microstrip vs {rw["model"]}',
                           text=f'TDR max |ΔZ| {rw["tdr_max_ohm"]:.2f} Ω, rms {rw["tdr_rms_ohm"]:.2f} Ω; '
                                f'|S21| max |Δ| {rw["s21_max_db_5g"]:.2f} dB to 5 GHz, {rw["s21_max_db_10g"]:.2f} dB to 10 GHz'))

    # ---- figure
    fig, axs = plt.subplots(1, 3, figsize=(12, 3.9), gridspec_kw=dict(width_ratios=[1.5, 1, 1], wspace=0.3))
    ax = axs[0]
    xe = np.repeat(np.linspace(0, P['lenIn'], NS + 1), 2)[1:-1]
    ax.plot(xe * IN * 2 / r['vRef'] * 1e9, np.repeat(r['profile'], 2), color=col['ink'], lw=1.2, ls=(0, (1, 1.6)),
            label='painted profile (at round-trip time)')
    ax.plot(tm * 1e9, zm.real, color=col['ref'], lw=4.5, alpha=0.8, label='measured (Anritsu MS46524B)')
    ax.plot(ts * 1e9, zs.real, color=col['port2'], lw=1.2, label='scikit-rf MLine model')
    ax.plot(r['t'] * 1e9, r['z'], color=col['refl'], lw=1.3, label='TDR Painter')
    ax.set_xlim(-0.2, t_end * 1e9 + 0.4)
    ax.set_ylim(15, 95)
    ax.set_xlabel('round-trip time (ns)')
    ax.set_ylabel('impedance (Ω)')
    ax.set_title(f'TDR (Kaiser β {beta}, 10 GHz)', loc='left')
    ax.legend(loc='upper left', fontsize=7.5)
    for a, (idx, title) in zip(axs[1:], (((1, 0), '|S21| (dB)'), ((0, 0), '|S11| (dB)'))):
        a.plot(f / 1e9, db(m.s[:, idx[0], idx[1]]), color=col['ref'], lw=3.5, alpha=0.8, label='measured')
        a.plot(f / 1e9, db(simu.s[:, idx[0], idx[1]]), color=col['port2'], lw=1, label='scikit-rf MLine')
        a.plot(f / 1e9, db(r['s21' if idx == (1, 0) else 's11'][1:]), color=col['refl'] if idx == (0, 0) else col['trans'],
               lw=1.1, label='TDR Painter')
        a.set_xlabel('frequency (GHz)')
        a.set_title(title, loc='left')
        a.legend(loc='lower left', fontsize=7.5)
    axs[2].set_ylim(-45, 0)
    fig.savefig(fig_dir / 'skrf-stepped-microstrip.png', bbox_inches='tight')
    plt.close(fig)

    md = ['### Stepped-impedance microstrip, measured\n',
          'From scikit-rf\'s [Time domain reflectometry, measurement vs simulation]'
          '(https://scikit-rf.readthedocs.io/en/latest/examples/networktheory/Time%20domain%20reflectometry%2C%20measurement%20vs%20simulation.html) '
          'example: 140 mm of microstrip on 1.55 mm FR-4 with a capacitive (8 mm wide) and an inductive (1 mm wide) '
          'section, SMA connectors at both ends, measured from 10 MHz to 10 GHz on an Anritsu MS46524B. The example '
          'extracts the substrate (ε_r and tan δ, by multiline TRL and an MLine fit) and a connector model; this '
          'script reruns that extraction on the vendored data and gets '
          f'ε_r = {fit["ep_r"]:.3f}, tan δ = {fit["tand"]:.4f} at 1 GHz, connector delay {fit["delay"]*1e12:.1f} ps '
          f'and impedance {fit["z_conn"]:.1f} Ω.\n',
          f'TDR Painter project: Dk {P["Dk"]} and Df {P["Df"]} at {P["frefGHz"]:g} GHz (the 3 mm line\'s effective values), '
          f'conductor loss {P["condLoss"]} dB/in at 10 GHz, Rdc {P["rdc"]} Ω/in, 10 GHz, '
          f'{P["lenIn"]:.3f} in painted. Each section:\n',
          row('Section', 'Length', 'Delay', 'Z (Ω)', 'ε_eff', 'Painted length (in)'), '| --- | --- | --- | --- | --- | --- |']
    md += [row(a, b, c, f'{z:.2f}', f'{e:.3f}', f'{l:.3f}') for a, b, c, z, e, l in table]
    md += ['', '![Stepped microstrip](figures/skrf-stepped-microstrip.png)\n',
           row('Compared with the measurement', 'TDR max |ΔZ|', 'TDR rms |ΔZ|', '|S21| max |Δ| to 5 GHz',
               '|S21| max |Δ| to 10 GHz', '|S11| rms Δ to 5 GHz'), '| --- | --- | --- | --- | --- | --- |']
    md += [row(rw['model'], f'{rw["tdr_max_ohm"]:.2f} Ω', f'{rw["tdr_rms_ohm"]:.2f} Ω', f'{rw["s21_max_db_5g"]:.2f} dB',
               f'{rw["s21_max_db_10g"]:.2f} dB', f'{rw["s11_rms_db_5g"]:.1f} dB') for rw in rows]
    md += ['', f'The TDR window is 0 to {(t_end + 0.3e-9)*1e9:.1f} ns. In the TDR, the painted model lands about as close to '
           'the measurement as scikit-rf\'s full microstrip model does. In frequency, both models follow the '
           'measurement through about 5 GHz and neither has the deep notch in the measured S21 near 6.4 GHz; '
           'scikit-rf\'s example likewise finds good frequency-domain agreement only in the lower half of the band. '
           f'The painted structure itself matches scikit-rf to {max(c["value"] for c in checks if c["tier"] == "A"):.0e} '
           '(tier A).\n']
    return dict(checks=checks, md='\n'.join(md), project=project, fit=fit, rows=rows)


# ================================================================================================ taper into 15 ohm
W_A, W_B, H2, T2, RHO2, ER2, ROUGH2 = 20 * MIL, 90 * MIL, 20 * MIL, 0.7 * MIL, 1.724138e-8, 10, 1e-6
TAPER_LEN, FEED_LEN, NSEC, R_LOAD = 200 * MIL, 50 * MIL, 50, 15.0


def mline2(freq, w):
    return MLine(freq, w=w, h=H2, t=T2, rho=RHO2, ep_r=ER2, rough=ROUGH2, disp='kobayashi', z0_port=50)


def taper_reference(kind, freq):
    """scikit-rf's network, exactly as in the example: feeder, 50-section taper, feeder, 15 ohm, short."""
    cls = rf.taper.Linear if kind == 'linear' else rf.taper.Exponential
    tp = cls(med=MLine, param='w', start=W_A, stop=W_B, length=TAPER_LEN, n_sections=NSEC,
             med_kw={'frequency': freq, 'h': H2, 't': T2, 'ep_r': ER2, 'rough': ROUGH2, 'rho': RHO2})
    m1, m2 = mline2(freq, W_A), mline2(freq, W_B)
    ntw = rf.network.cascade_list([m1.line(d=50, unit='mil'), tp.network, m2.line(d=50, unit='mil'),
                                   m2.resistor(R=R_LOAD), m2.short()])
    return ntw, np.asarray(tp.value_vector)


def taper_structure(kind, widths):
    f_mid = 10e9
    fq = rf.Frequency.from_f([f_mid], unit='hz')
    dk = 6.0                     # TDR Painter's ceiling; the lines' own ε_eff (6.8 to 8.3) goes into the lengths
    vals = {}
    for w in sorted(set([W_A, W_B, *widths])):
        mm = mline2(fq, w)
        vals[w] = (float(mm.Z0.real[0]), float(mm.ep_reff_f.real[0]))
    nom = mline2(fq, W_A)
    params = dict(Dk=dk, Df=0.0, condLoss=round(float(nom.alpha_conductor[0]) * NP_DB * IN, 5), condRefGHz=10,
                  rdc=round(RHO2 / (W_A * T2) * IN, 5), z0=round(vals[W_A][0], 3), fmaxGHz=20, zTx=50, zRx=R_LOAD)
    eq = lambda L, w: L * math.sqrt(vals[w][1] / dk) / IN  # noqa: E731
    stack = [(eq(FEED_LEN, W_A), vals[W_A][0])] + [(eq(TAPER_LEN / NSEC, w), vals[w][0]) for w in widths] \
        + [(eq(FEED_LEN, W_B), vals[W_B][0])]
    return stack_structure(params, stack), vals


def run_taper(run_engine, fig_dir, col, lim):
    out, checks, projects = {}, [], {}
    for kind in ('linear', 'exponential'):
        f_ref, s_ref = np.loadtxt(TP / 'taper' / f'ANSYS_Circuit_taper_{kind}_s_mag.csv', delimiter=',', skiprows=1, unpack=True)
        freq = rf.Frequency.from_f(f_ref * 1e9, unit='hz')
        ntw_sk, widths = taper_reference(kind, freq)
        st, vals = taper_structure(kind, widths)
        P = st.params
        projects[kind] = st.project(f'Microstrip {kind} taper into 15 Ω (scikit-rf taper example)',
                                    f'A 20 to 90 mil {kind} microstrip taper on εr = 10, from scikit-rf\'s "Tapered '
                                    'transmission lines" example, painted from MLine impedances and delays and '
                                    'terminated in 15 Ω (the receiver impedance). Compare |S11| with ANSYS Circuit in '
                                    'validation/report/REPORT.md.')
        r = run_engine([dict(id=kind, project=projects[kind])])[kind]
        idx = np.round(f_ref * 1e9 / (r['f'][1] - r['f'][0])).astype(int)
        if np.abs(r['f'][idx] - f_ref * 1e9).max() > 1:
            raise RuntimeError('ANSYS frequencies are not on the TDR Painter grid')
        s11_tp = np.abs(r['s11'][idx])
        ntw_st = st.network(frequency(P))
        a = float(np.abs(r['s11'][1:] - ntw_st.s[:, 0, 0]).max())
        checks.append(dict(tier='A', name=f'{kind} taper, painted structure, S11: max |engine − scikit-rf|', value=a,
                           limit=lim['sparam'], fmt='{:.1e}', ok=a <= lim['sparam']))
        e_tp = np.abs(s11_tp - s_ref)
        e_sk = np.abs(ntw_sk.s_mag[:, 0, 0] - s_ref)
        out[kind] = dict(f=f_ref, ansys=s_ref, skrf=ntw_sk.s_mag[:, 0, 0], tp=s11_tp, r=r, st=st,
                         err_tp=float(e_tp.max()), err_sk=float(e_sk.max()), err_tp_10=float(e_tp[f_ref <= 10].max()))
        checks.append(dict(tier='R', ok=None, name=f'{kind} taper: |S11| vs ANSYS Circuit',
                           text=f'TDR Painter max |Δ| {e_tp.max():.3f} ({e_tp[f_ref <= 10].max():.3f} to 10 GHz); '
                                f'scikit-rf MLine {e_sk.max():.3f}'))

    fig, axs = plt.subplots(1, 3, figsize=(12, 3.6), gridspec_kw=dict(width_ratios=[1, 1, 1], wspace=0.3))
    ax = axs[0]
    for kind, ls in (('linear', '-'), ('exponential', (0, (4, 2)))):
        st = out[kind]['st']
        xe = np.repeat(np.linspace(0, st.params['lenIn'], NS + 1), 2)[1:-1]
        ax.plot(xe * 1000, np.repeat(st.profile(), 2), color=col['ink'], lw=1.3, ls=ls, label=f'{kind}')
    ax.set_xlabel('painted position (mil, at Dk 6)')
    ax.set_ylabel('impedance (Ω)')
    ax.set_title('Painted profiles', loc='left')
    ax.legend()
    for a, kind in zip(axs[1:], ('linear', 'exponential')):
        o = out[kind]
        a.plot(o['f'], o['ansys'], color=col['ref'], lw=4.5, alpha=0.8, label='ANSYS Circuit')
        a.plot(o['f'], o['skrf'], color=col['port2'], lw=1.1, label='scikit-rf MLine')
        a.plot(o['f'], o['tp'], color=col['refl'], lw=1.3, label='TDR Painter')
        a.set_ylim(0, 0.6)
        a.set_xlim(1, 20)
        a.set_xlabel('frequency (GHz)')
        a.set_title(f'|S11|, {kind} taper', loc='left')
        a.legend(loc='upper right', fontsize=7.5)
    fig.savefig(fig_dir / 'skrf-taper.png', bbox_inches='tight')
    plt.close(fig)

    lin = out['linear']['st'].params
    md = ['### Microstrip taper into 15 Ω, ANSYS Circuit\n',
          'From scikit-rf\'s [Tapered transmission lines]'
          '(https://scikit-rf.readthedocs.io/en/latest/examples/taper/tapered_transmission_lines.html) example: a '
          '200 mil microstrip taper from 20 to 90 mil wide (about 48 to 19 Ω) on a 20 mil, ε_r = 10 substrate, with '
          '50 mil feeders, loaded by 15 Ω to ground. The example compares scikit-rf\'s MLine model against |S11| '
          'exported from ANSYS Circuit; both are vendored.\n',
          f'TDR Painter project: 50 Ω source, 15 Ω receiver (the load), conductor loss {lin["condLoss"]} dB/in at '
          f'10 GHz, no dielectric loss (as in the example). These lines have ε_eff 6.8 to 8.3, above TDR Painter\'s '
          'Dk limit of 6, so the project uses Dk 6 and paints each section longer by √(ε_eff/6) to keep its delay.\n',
          '![Microstrip taper](figures/skrf-taper.png)\n',
          row('Taper', 'TDR Painter vs ANSYS, max abs(Δ|S11|)', 'to 10 GHz', 'scikit-rf MLine vs ANSYS'), '| --- | --- | --- | --- |']
    md += [row(k, f'{out[k]["err_tp"]:.3f}', f'{out[k]["err_tp_10"]:.3f}', f'{out[k]["err_sk"]:.3f}') for k in out]
    md += ['', 'The painted structures match scikit-rf to '
           f'{max(c["value"] for c in checks if c["tier"] == "A"):.0e} (tier A).\n']
    return dict(checks=checks, md='\n'.join(md), projects=projects,
                errs={k: dict(tdr_painter=out[k]['err_tp'], tdr_painter_to_10ghz=out[k]['err_tp_10'], skrf=out[k]['err_sk'])
                      for k in out})


# ================================================================================================ entry
def run(here, run_engine, col, lim):
    fig_dir = here / 'report' / 'figures'
    a = run_stepped(run_engine, fig_dir, col, lim)
    b = run_taper(run_engine, fig_dir, col, lim)
    import json
    (here / 'cases' / 'skrf-stepped-microstrip.json').write_text(json.dumps(a['project'], indent=1) + '\n')
    for k, p in b['projects'].items():
        (here / 'cases' / f'skrf-taper-{k}.json').write_text(json.dumps(p, indent=1) + '\n')
    md = '## Cases from scikit-rf’s documentation (tier R)\n\n' \
         'The synthetic cases above check the code against itself and against textbook physics. These two check it ' \
         'against the outside world: a VNA measurement and a commercial circuit solver, both published with ' \
         'scikit-rf. TDR Painter has no microstrip model, so each section is painted with the impedance and delay ' \
         'that scikit-rf\'s MLine gives for its width at mid-band. The comparisons are informational: they show how ' \
         'close a 1-D painted model gets, with scikit-rf\'s full microstrip model as the yardstick.\n\n' + a['md'] + '\n' + b['md']
    return dict(checks=a['checks'] + b['checks'], markdown=md,
                json=dict(stepped_microstrip=dict(fit=a['fit'], comparison=a['rows']), taper=b['errs']))
