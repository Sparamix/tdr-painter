const path = require('path');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));
const IN = E.IN, C0 = E.C0;
let fails = 0;
function check(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${got.toPrecision(6)} want ${want.toPrecision(6)} (tol ${tol})`);
}
const base = {
  lenIn: 2, z0: 50, Dk: 3.35, Df: 0.004, frefGHz: 12, dsLowHz: 1e3, dsHighHz: 1e12,
  condLoss: 0.4, condRefGHz: 10, rdc: 0.2, fmaxGHz: 50, nf: 1001,
  zTx: 50, zRx: 50, beta: 4.2, lossless: false,
};
const NS = 500;
const flat = (z) => new Float64Array(NS).fill(z);
const mag = (r, i) => Math.hypot(r, i);
const db = (r, i) => 20 * Math.log10(mag(r, i));

// 1) DS model reproduces Dk/Df at f_ref
{
  const ds = E.makeDS(3.35, 0.004, 12e9, 1e3, 1e12);
  const e = ds.eps(12e9);
  check('DS Re eps @fref', e[0], 3.35, 1e-12);
  check('DS tan d @fref', -e[1] / e[0], 0.004, 1e-12);
  const e1 = ds.eps(1e9);
  console.log(`      DS @1 GHz: Dk ${e1[0].toFixed(4)}, Df ${(-e1[1]/e1[0]).toFixed(5)}; @50 GHz Dk ${ds.eps(50e9)[0].toFixed(4)}`);
}

// 2) Lossless matched line: S11 = 0, |S21| = 1, phase = -beta*l
{
  const P = { ...base, lossless: true };
  const prep = E.prepare(P);
  const s = E.solve(prep, E.buildCascade(flat(50), [], P));
  let m11 = 0, e21 = 0;
  for (let k = 0; k < P.nf; k++) { m11 = Math.max(m11, mag(s.s11r[k], s.s11i[k])); e21 = Math.max(e21, Math.abs(mag(s.s21r[k], s.s21i[k]) - 1)); }
  check('lossless matched max|S11|', m11, 0, 1e-12);
  check('lossless matched max||S21|-1|', e21, 0, 1e-12);
  const k = 200, fk = prep.f[k];
  const ph = Math.atan2(s.s21i[k], s.s21r[k]);
  const want = -2 * Math.PI * fk * Math.sqrt(3.35) / C0 * 2 * IN;
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  check('lossless S21 phase @10 GHz', wrap(ph - want), 0, 1e-9);
}

// 3) Lossless 45-ohm line between 50-ohm ports vs analytic
{
  const P = { ...base, lossless: true };
  const prep = E.prepare(P);
  const s = E.solve(prep, E.buildCascade(flat(45), [], P));
  const G = (45 - 50) / (45 + 50);
  let err = 0, pmax = 0;
  for (let k = 1; k < P.nf; k++) {
    const th = 2 * Math.PI * prep.f[k] * Math.sqrt(3.35) / C0 * 2 * IN;
    // S11 = G (1 - e^{-2j th}) / (1 - G^2 e^{-2j th})
    const er = Math.cos(-2 * th), ei = Math.sin(-2 * th);
    const nr = G * (1 - er), ni = -G * ei;
    const dr = 1 - G * G * er, di = -G * G * ei;
    const dd = dr * dr + di * di;
    const wr = (nr * dr + ni * di) / dd, wi = (ni * dr - nr * di) / dd;
    err = Math.max(err, Math.hypot(s.s11r[k] - wr, s.s11i[k] - wi));
    const p = s.s11r[k] ** 2 + s.s11i[k] ** 2 + s.s21r[k] ** 2 + s.s21i[k] ** 2;
    pmax = Math.max(pmax, Math.abs(p - 1));
  }
  check('45-ohm line S11 vs analytic (max err)', err, 0, 1e-10);
  check('lossless power balance |S11|^2+|S21|^2-1', pmax, 0, 1e-12);
  const ripple = 1 / (2 * 2 * IN * Math.sqrt(3.35) / C0) / 1e9;
  console.log(`      S11 null spacing (1/(2 tau)) = ${ripple.toFixed(3)} GHz`);
}

// 4) Shunt C at port (zero-length position) vs analytic S11 = -jwCZ0/(2 + jwCZ0)
{
  const P = { ...base, lossless: true };
  const prep = E.prepare(P);
  const C = 0.2e-12;
  const s = E.solve(prep, E.buildCascade(flat(50), [{ id: 1, type: 'C', x: 0, value: 0.2, count: 1, pitch: 0 }], P));
  const k = 400, w = 2 * Math.PI * prep.f[k];
  const x = w * C * 50;
  // -jx/(2+jx) = (-jx)(2-jx)/(4+x^2) = (-x^2 - 2jx)/(4+x^2)
  check('shunt C |S11| @20 GHz', mag(s.s11r[k], s.s11i[k]), Math.hypot(x * x, 2 * x) / (4 + x * x), 1e-12);
}

// 5) Series L and series R at port
{
  const P = { ...base, lossless: true };
  const prep = E.prepare(P);
  const sL = E.solve(prep, E.buildCascade(flat(50), [{ id: 1, type: 'L', x: 0, value: 0.5, count: 1, pitch: 0 }], P));
  const k = 400, w = 2 * Math.PI * prep.f[k], x = w * 0.5e-9 / 50;
  check('series L |S11| @20 GHz', mag(sL.s11r[k], sL.s11i[k]), x / Math.hypot(2, x), 1e-12);
  const sR = E.solve(prep, E.buildCascade(flat(50), [{ id: 1, type: 'R', x: 1, value: 5, count: 1, pitch: 0 }], P));
  check('series R S11 at DC', sR.s11r[0], 5 / 105, 1e-12);
}

// 6) Mismatched ports: Rx = 100 ohm at DC
{
  const P = { ...base, lossless: true, zRx: 100 };
  const prep = E.prepare(P);
  const s = E.solve(prep, E.buildCascade(flat(50), [], P));
  check('Rx 100 ohm S11 at DC', s.s11r[0], 50 / 150, 1e-12);
  let pmax = 0;
  for (let k = 0; k < P.nf; k++) pmax = Math.max(pmax, Math.abs(s.s11r[k] ** 2 + s.s11i[k] ** 2 + s.s21r[k] ** 2 + s.s21i[k] ** 2 - 1));
  check('Rx 100 ohm lossless power balance', pmax, 0, 1e-12);
}

// 7) Loss: matched lossy line IL vs alpha*l estimate
{
  const P = { ...base, rdc: 0 };
  const prep = E.prepare(P);
  const s = E.solve(prep, E.buildCascade(flat(50), [], P));
  const k = 200; // 10 GHz
  const il = -db(s.s21r[k], s.s21i[k]);
  const ds = E.makeDS(3.35, 0.004, 12e9, 1e3, 1e12);
  const e = ds.eps(10e9);
  const ad = 8.686 * Math.PI * 10e9 * Math.sqrt(e[0]) * (-e[1] / e[0]) / C0 * IN; // dB/in
  const want = (0.4 + ad) * 2;
  console.log(`      dielectric loss @10 GHz: ${ad.toFixed(4)} dB/in (Bogatin rule 2.3*f*Df*sqrt(Dk) = ${(2.3*10*(-e[1]/e[0])*Math.sqrt(e[0])).toFixed(4)})`);
  check('2-in IL @10 GHz vs (alpha_c+alpha_d)*l', il, want, 0.01);
  console.log(`      IL @50 GHz: ${(-db(s.s21r[1000], s.s21i[1000])).toFixed(3)} dB`);
}

// 8) Open stub resonance near v/(4 l)
{
  const P = { ...base, lossless: true };
  const prep = E.prepare(P);
  const s = E.solve(prep, E.buildCascade(flat(50), [{ id: 1, type: 'stub', x: 1, stubZ: 45, stubLen: 60, count: 1, pitch: 0 }], P));
  let kmin = 1, vmin = 0;
  for (let k = 1; k < P.nf; k++) { const v = db(s.s21r[k], s.s21i[k]); if (v < vmin) { vmin = v; kmin = k; } }
  const want = C0 / Math.sqrt(3.35) / (4 * 60e-3 * IN) / 1e9;
  check('stub notch freq (GHz)', prep.f[kmin] / 1e9, want, 0.06);
  console.log(`      notch depth ${vmin.toFixed(1)} dB`);
}

// 9) Periodic shunt C: stopband near v/(2p)
{
  const P = { ...base, lossless: true };
  const prep = E.prepare(P);
  const s = E.solve(prep, E.buildCascade(flat(50), [{ id: 1, type: 'C', x: 0.15, value: 0.06, count: 12, pitch: 0.15 }], P));
  let kmin = 1, vmin = 0;
  for (let k = 100; k < 600; k++) { const v = db(s.s21r[k], s.s21i[k]); if (v < vmin) { vmin = v; kmin = k; } }
  const bragg = C0 / Math.sqrt(3.35) / (2 * 0.15 * IN) / 1e9;
  console.log(`      periodic C: min S21 ${vmin.toFixed(2)} dB at ${(prep.f[kmin]/1e9).toFixed(2)} GHz; Bragg v/(2p) = ${bragg.toFixed(2)} GHz`);
  check('Bragg stopband near v/(2p) (GHz)', prep.f[kmin] / 1e9, bragg, 1.5);
}

// 10) TDR: shunt C area method recovers C (beta 10, so the window edge at fmax is negligible); series R level
{
  const P = { ...base, lossless: true, beta: 10 };
  const prep = E.prepare(P);
  const tr = E.riseTime(prep);
  console.log(`      Kaiser beta 10, 50 GHz: 10-90 rise ${(tr*1e12).toFixed(2)} ps; spatial res ~ ${(tr*prep.vRef/2/IN*1000).toFixed(1)} mil`);
  const s = E.solve(prep, E.buildCascade(flat(50), [{ id: 1, type: 'C', x: 1, value: 0.2, count: 1, pitch: 0 }], P));
  const r = E.tdr(prep, s.s11r, s.s11i, 2e-9);
  let area = 0;
  for (let n = 0; n < r.t.length; n++) area += r.rho[n] * prep.dt;
  check('TDR area -> shunt C (pF)', -2 * area / 50 * 1e12, 0.2, 0.005);
  const sR = E.solve(prep, E.buildCascade(flat(50), [{ id: 1, type: 'R', x: 1, value: 5, count: 1, pitch: 0 }], P));
  const rR = E.tdr(prep, sR.s11r, sR.s11i, 2e-9);
  const rho = rR.rho[rR.rho.length - 1];
  check('TDR series R final Z', 50 * (1 + rho) / (1 - rho), 55, 0.05);
  const sL = E.solve(prep, E.buildCascade(flat(50), [{ id: 1, type: 'L', x: 1, value: 0.4, count: 1, pitch: 0 }], P));
  const rL = E.tdr(prep, sL.s11r, sL.s11i, 2e-9);
  let aL = 0; for (let n = 0; n < rL.t.length; n++) aL += rL.rho[n] * prep.dt;
  check('TDR area -> series L (nH)', 2 * 50 * aL * 1e9, 0.4, 0.01);
  // location of C dip: round-trip time 2*tau(1 in)
  let nmin = 0; for (let n = 0; n < r.t.length; n++) if (r.rho[n] < r.rho[nmin]) nmin = n;
  check('C dip round-trip time (ps), 0.2 pF lags by RC', r.t[nmin] * 1e12, 2 * IN * Math.sqrt(3.35) / C0 * 1e12, 6);
}

// 11) Painted 45-ohm short section: excursion readout vs TDR integral
{
  const P = { ...base, lossless: true };
  const prep = E.prepare(P);
  const prof = flat(50);
  for (let i = 200; i < 215; i++) prof[i] = 35;
  const ex = E.excursions(prof, P, 0.25);
  const s = E.solve(prep, E.buildCascade(prof, [], P));
  const r = E.tdr(prep, s.s11r, s.s11i, 2e-9);
  let area = 0; for (let n = 0; n < r.t.length; n++) area += r.rho[n] * prep.dt;
  console.log(`      painted dip: readout C ${(ex[0].C*1e12).toFixed(4)} pF, TDR-integral C ${(-2*area/50*1e12).toFixed(4)} pF, delay ${(ex[0].delay*1e12).toFixed(2)} ps`);
  check('painted dip readout vs TDR integral (pF)', ex[0].C * 1e12, -2 * area / 50 * 1e12, 0.01);
}

// 11b) Experimental wide impedance range: parser limits, quantization, shorts and opens
{
  const ok = (name, cond, detail) => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`); };
  const PJ = require(path.join(__dirname, '..', 'src', 'project.js'));
  const proj = (params, runs, elements) => ({ format: PJ.FORMAT, formatVersion: 1, params: { ...PJ.DEFAULTS, ...params }, profile: { cells: 500, runs }, elements: elements || [] });
  const wide = PJ.parse(proj({ extremeZ: true, zRx: 0.001, zTx: 50 }, [[50, 400], [0.0012345, 100]], [{ type: 'R', x: 1, value: 1e6 }, { type: 'stub', x: 1, stubZ: 0.001, stubLen: 60 }]), 500);
  ok('wide: Rx 1 mohm kept', wide.P.zRx === 0.001, wide.P.zRx);
  ok('wide: profile below 1 ohm kept', Math.abs(wide.prof[499] - 0.0012345) < 1e-12, wide.prof[499]);
  ok('wide: R of 1 Mohm kept', wide.elements[0].value === 1e6);
  ok('wide: stub of 1 mohm kept', wide.elements[1].stubZ === 0.001);
  const norm = PJ.parse(proj({ zRx: 0.001 }, [[0.5, 500]], [{ type: 'R', x: 1, value: 1e6 }]), 500);
  ok('normal: Rx clamped to 10 ohm', norm.P.zRx === 10, norm.P.zRx);
  ok('normal: profile clamped to 5 ohm', norm.prof[0] === 5);
  ok('normal: R clamped to 25 ohm', norm.elements[0].value === 25);
  ok('quantZ: 1 mohm steps above 1 ohm', PJ.quantZ(49.99951) === 50 && PJ.quantZ(1.0004) === 1);
  ok('quantZ: 4 significant digits below 1 ohm', PJ.quantZ(0.00123456) === 0.001235 && PJ.quantZ(0.5) === 0.5);
  const runs = PJ.encodeProfile(Float64Array.from({ length: 500 }, (_, i) => i < 250 ? 50 : 0.00123456));
  ok('encodeProfile keeps sub-ohm values', runs.length === 2 && runs[1][0] === 0.001235, JSON.stringify(runs));
  const v = (view, extremeZ) => PJ.parse({ ...proj({ extremeZ }, [[50, 500]]), view }, 500).view;
  ok('view: log range kept', JSON.stringify(v({ zMin: 0.001, zMax: 100, log: true })) === '{"zMin":0.001,"zMax":100,"log":true}');
  ok('view: log range must be positive', v({ zMin: 0, zMax: 100, log: true }) === null);
  ok('view: narrow linear range needs the wide flag', v({ zMin: 0, zMax: 0.5 }, false) === null && v({ zMin: 0, zMax: 0.5 }, true) !== null);

  // a short and an open at Rx: S11 -> -1 and +1 at DC, TDR settles there; S stays finite and passive
  for (const [zRx, sign] of [[0.001, -1], [1e6, 1]]) {
    const P = { ...base, lossless: true, extremeZ: true, zRx };
    const prep = E.prepare(P);
    const s = E.solve(prep, E.buildCascade(flat(50), [], P));
    const g = (zRx - 50) / (zRx + 50);
    ok(`Rx ${zRx} ohm: S11(DC) = (Zrx-Z0)/(Zrx+Z0)`, Math.abs(s.s11r[0] - g) < 1e-12, s.s11r[0]);
    let worst = 0, finite = true;
    for (let k = 0; k < prep.nf; k++) {
      const a = s.s11r[k] ** 2 + s.s11i[k] ** 2, b = s.s21r[k] ** 2 + s.s21i[k] ** 2;
      if (!isFinite(a + b)) finite = false;
      worst = Math.max(worst, Math.abs(a + b - 1));
    }
    ok(`Rx ${zRx} ohm: lossless energy |S11|²+|S21|² = 1`, finite && worst < 1e-9, worst.toExponential(2));
    const td = E.tdr(prep, s.s11r, s.s11i, 2e-9);
    ok(`Rx ${zRx} ohm: TDR settles at rho = ${sign}`, Math.abs(td.rho[td.rho.length - 1] - g) < 2e-3, td.rho[td.rho.length - 1]);
  }
  // a 1 mohm open stub shorts the line at its position (lossless): S21 ~ 0 well above DC
  {
    const P = { ...base, lossless: true, extremeZ: true };
    const prep = E.prepare(P);
    const s = E.solve(prep, E.buildCascade(flat(50), [{ id: 1, type: 'stub', x: 1, stubZ: 0.001, stubLen: 60, count: 1, pitch: 0 }], P));
    const k = 200;   // 10 GHz
    ok('1 mohm open stub shunts the line at 10 GHz (a nanofarad capacitor)', Math.hypot(s.s21r[k], s.s21i[k]) < 1e-3, Math.hypot(s.s21r[k], s.s21i[k]).toExponential(2));
    ok('... but is open at DC', Math.abs(s.s21r[0] - 1) < 1e-12, s.s21r[0]);
  }
  // shorted stubs: a short at DC; a 60 mil, 50 ohm one is an open at its quarter-wave (lossless)
  {
    const P = { ...base, lossless: true, extremeZ: true };
    const prep = E.prepare(P);
    const sh = (z, len) => E.solve(prep, E.buildCascade(flat(50), [{ id: 1, type: 'stub', x: 1, stubZ: z, stubLen: len, end: 'short', count: 1, pitch: 0 }], P));
    let s = sh(0.001, 20);
    ok('1 mohm shorted stub: S11(DC) = -1, S21(DC) = 0', Math.abs(s.s11r[0] + 1) < 1e-12 && Math.abs(s.s21r[0]) < 1e-12, s.s11r[0] + ' ' + s.s21r[0]);
    ok('1 mohm shorted stub: S21 ~ 0 across the band', Math.max(...Array.from(s.s21r, (v, i) => Math.hypot(v, s.s21i[i]))) < 1e-3);
    const fq = prep.vRef / (4 * 60e-3 * IN), kq = fq / prep.df;
    const P2 = { ...P, fmaxGHz: fq * 1000 / 537 / 1e9 };       // put grid point 537 on the quarter-wave
    const prep2 = E.prepare(P2);
    s = E.solve(prep2, E.buildCascade(flat(50), [{ id: 1, type: 'stub', x: 1, stubZ: 50, stubLen: 60, end: 'short', count: 1, pitch: 0 }], P2));
    ok('50 ohm, 60 mil shorted stub is an open at v/(4l): |S21| = 1', Math.abs(Math.hypot(s.s21r[537], s.s21i[537]) - 1) < 1e-9, Math.hypot(s.s21r[537], s.s21i[537]));
    const PJ = require(path.join(__dirname, '..', 'src', 'project.js'));
    const pe = PJ.parse({ format: PJ.FORMAT, formatVersion: 1, params: {}, profile: { cells: 500, runs: [[50, 500]] },
      elements: [{ type: 'stub', x: 1, stubZ: 45, stubLen: 60, end: 'short' }, { type: 'stub', x: 1, stubZ: 45, stubLen: 60, end: 'weird' }] }, 500);
    ok('parser keeps end: short, and reads anything else as open', pe.elements[0].end === 'short' && pe.elements[1].end === 'open');
  }
}

// 11c) Conductor and dielectric loss switch off separately; lossless means both
{
  const s21 = (extra) => { const P = { ...base, ...extra }; const prep = E.prepare(P); const s = E.solve(prep, E.buildCascade(flat(50), [], P)); return Math.hypot(s.s21r[1000], s.s21i[1000]); };
  const lossy = s21({}), noCond = s21({ condLossless: true }), noDiel = s21({ dielLossless: true }), none = s21({ lossless: true }), both = s21({ condLossless: true, dielLossless: true });
  const okb = (name, cond, detail) => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`); };
  okb('conductor-only lossless keeps dielectric loss', noCond > lossy && noCond < 1 - 1e-3, [lossy, noCond]);
  okb('dielectric-only lossless keeps conductor loss', noDiel > lossy && noDiel < 1 - 1e-3, [lossy, noDiel]);
  okb('both parts off equals lossless', Math.abs(both - none) < 1e-15 && Math.abs(none - 1) < 1e-9, [both, none]);
  const PJ = require(path.join(__dirname, '..', 'src', 'project.js'));
  const pp = (params) => PJ.parse({ format: PJ.FORMAT, formatVersion: 1, params, profile: { cells: 500, runs: [[50, 500]] } }, 500).P;
  const legacy = pp({ lossless: true }), half = pp({ condLossless: true });
  okb('legacy lossless: true means both parts', legacy.condLossless && legacy.dielLossless && legacy.lossless);
  okb('one part alone leaves lossless false', half.condLossless && !half.dielLossless && !half.lossless);
}

// 11d) A disabled element is left out of the circuit
{
  const P = { ...base, lossless: true };
  const prep = E.prepare(P);
  const on = E.solve(prep, E.buildCascade(flat(50), [{ id: 1, type: 'C', x: 1, value: 0.5, count: 1, pitch: 0 }], P));
  const off = E.solve(prep, E.buildCascade(flat(50), [{ id: 1, type: 'C', x: 1, value: 0.5, count: 1, pitch: 0, enabled: false }], P));
  const none = E.solve(prep, E.buildCascade(flat(50), [], P));
  const d = Math.max(...Array.from(off.s11r, (v, k) => Math.hypot(v - none.s11r[k], off.s11i[k] - none.s11i[k])));
  check('disabled C: same as no element', d, 0, 1e-15);
  check('enabled C: reflects', Math.hypot(on.s11r[400], on.s11i[400]) > 0.1 ? 1 : 0, 1, 0);
  const PJ = require(path.join(__dirname, '..', 'src', 'project.js'));
  const pe = PJ.parse({ format: PJ.FORMAT, formatVersion: 1, params: {}, profile: { cells: 500, runs: [[50, 500]] },
    elements: [{ type: 'C', x: 1, value: 0.1, enabled: false }, { type: 'C', x: 1, value: 0.1 }] }, 500);
  check('parser: enabled false kept, missing means true', (pe.elements[0].enabled === false && pe.elements[1].enabled === true) ? 1 : 0, 1, 0);
}

// 11e) Display units ride along in the view; stub lengths keep 0.01 mil
{
  const PJ = require(path.join(__dirname, '..', 'src', 'project.js'));
  const pv = (view, elements) => PJ.parse({ format: PJ.FORMAT, formatVersion: 1, params: {}, profile: { cells: 500, runs: [[50, 500]] }, view, elements: elements || [] }, 500);
  check('units: metric read from the view', pv({ units: 'metric' }).units === 'metric' ? 1 : 0, 1, 0);
  check('units: anything else is null (keep the current setting)', pv({ units: 'cubits' }).units === null && pv(undefined).units === null ? 1 : 0, 1, 0);
  check('stub length keeps 0.01 mil', pv(null, [{ type: 'stub', x: 1, stubZ: 45, stubLen: 39.3701 }]).elements[0].stubLen, 39.37, 1e-12);
}

// 11f) Attenuator: a resistive T pad is matched both ways and loses exactly its dB (lossless line)
{
  const sq = (s, k) => Math.hypot(s.s11r[k], s.s11i[k]), s21 = (s, k) => Math.hypot(s.s21r[k], s.s21i[k]);
  const run = (zIn, zOut, dB) => {
    const P = { ...base, lossless: true, zTx: zIn, zRx: zOut };
    const prof = Float64Array.from({ length: 500 }, (_, i) => i < 250 ? zIn : zOut);
    const prep = E.prepare(P);
    return E.solve(prep, E.buildCascade(prof, [{ id: 1, type: 'pad', x: 1, value: dB, zIn, zOut, count: 1, pitch: 0 }], P));
  };
  for (const [zi, zo, dB] of [[50, 50, 10], [50, 75, 10], [75, 50, 3], [50, 75, 0.1]]) {
    const s = run(zi, zo, dB), want = Math.max(dB, E.padMinLoss(zi, zo));
    let worstS11 = 0, worstS21 = 0;
    for (const k of [0, 100, 500, 1000]) { worstS11 = Math.max(worstS11, sq(s, k)); worstS21 = Math.max(worstS21, Math.abs(20 * Math.log10(s21(s, k)) + want)); }
    check(`pad ${zi}->${zo} ohm, ${dB} dB: matched (max |S11|)`, worstS11, 0, 1e-12);
    check(`pad ${zi}->${zo} ohm, ${dB} dB: |S21| = -${want.toFixed(3)} dB`, worstS21, 0, 1e-9);
  }
  check('min-loss pad 50 -> 75 ohm is 5.72 dB', E.padMinLoss(50, 75), 5.719, 1e-3);
  const r = E.padResistors(50, 50, 6);
  check('6 dB, 50 ohm T pad: series 16.61 ohm', r.r1, 16.61, 0.01);
  check('6 dB, 50 ohm T pad: shunt 66.93 ohm', r.r3, 66.93, 0.01);
}

// 11g) Side-panel order from the view: known names once, missing ones appended in the default order
{
  const PJ = require(path.join(__dirname, '..', 'src', 'project.js'));
  const pv = (panels) => PJ.parse({ format: PJ.FORMAT, formatVersion: 1, params: {}, profile: { cells: 500, runs: [[50, 500]] }, view: { panels } }, 500).panels;
  check('panels: saved order kept, gaps filled', JSON.stringify(pv(['ports', 'bogus', 'ports', 'line'])) === JSON.stringify(['ports', 'line', 'range', 'diel', 'cond', 'sweep', 'export']) ? 1 : 0, 1, 0);
  check('panels: none saved means null (keep the current order)', pv(undefined) === null ? 1 : 0, 1, 0);
}

// 12) Timing
{
  const P = { ...base };
  const prep = E.prepare(P);
  const prof = flat(50);
  for (let i = 0; i < 500; i++) prof[i] = 50 + 5 * Math.sin(i / 7);
  const els = [{ id: 1, type: 'C', x: 0.3, value: 0.1, count: 10, pitch: 0.15 }, { id: 2, type: 'stub', x: 1, stubZ: 45, stubLen: 60, count: 1, pitch: 0 }];
  let t = performance.now();
  const N = 20;
  for (let i = 0; i < N; i++) { const c = E.buildCascade(prof, els, P); const s = E.solve(prep, c); E.tdr(prep, s.s11r, s.s11i, 2e-9); }
  console.log(`      worst-case (500 distinct cells) solve+tdr: ${((performance.now() - t) / N).toFixed(1)} ms`);
  t = performance.now();
  for (let i = 0; i < N; i++) { const c = E.buildCascade(flat(50), els, P); const s = E.solve(prep, c); E.tdr(prep, s.s11r, s.s11i, 2e-9); }
  console.log(`      flat + elements solve+tdr: ${((performance.now() - t) / N).toFixed(1)} ms`);
  t = performance.now();
  for (let i = 0; i < 5; i++) E.prepare(P);
  console.log(`      prepare: ${((performance.now() - t) / 5).toFixed(1)} ms`);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
