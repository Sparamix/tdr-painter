/* TDR Painter engine: impedance profile + lumped elements -> S-parameters -> band-limited TDR.
 * Model: 1-D TEM cascade. Each profile cell is a uniform lossy line of impedance Z_i.
 * Dielectric: Djordjevic-Sarkar (causal). Conductor: (1+j)*K*sqrt(f) surface impedance + Rdc.
 * Per-unit-length R and L scale with Z_i and C scales with 1/Z_i, so gamma is the same in every
 * cell and only reflections change with the painted impedance.
 */
(function (root) {
  'use strict';
  const C0 = 299792458;
  const IN = 0.0254;
  const TWO_PI = 2 * Math.PI;

  // Djordjevic-Sarkar: eps(f) = eps_inf + d_eps/ln(f2/f1) * ln((f2 + jf)/(f1 + jf)), anchored at (Dk, Df) @ f_ref.
  // f1/f2 in Hz (scikit-rf convention, defaults 1 kHz / 1 THz).
  function makeDS(Dk, Df, frefHz, f1, f2) {
    const s = 1 / Math.log(f2 / f1);
    function F(f) {
      const re = 0.5 * Math.log((f2 * f2 + f * f) / (f1 * f1 + f * f));
      const im = Math.atan2(f, f2) - Math.atan2(f, f1);
      return [re * s, im * s];
    }
    if (Df <= 0) return { epsInf: Dk, dEps: 0, eps: () => [Dk, 0] };
    const Fr = F(frefHz);
    const dEps = -Dk * Df / Fr[1];
    const epsInf = Dk - dEps * Fr[0];
    return {
      epsInf, dEps,
      eps(f) { const Ff = F(f); return [epsInf + dEps * Ff[0], dEps * Ff[1]]; } // im <= 0 (loss)
    };
  }

  function csqrt(re, im) {
    const r = Math.hypot(re, im);
    const sr = Math.sqrt(Math.max(0, (r + re) / 2));
    let si = Math.sqrt(Math.max(0, (r - re) / 2));
    if (im < 0) si = -si;
    return [sr, si];
  }

  function besselI0(x) {
    let sum = 1, term = 1;
    const q = x * x / 4;
    for (let k = 1; k < 60; k++) {
      term *= q / (k * k);
      sum += term;
      if (term < 1e-17 * sum) break;
    }
    return sum;
  }

  function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

  // In-place iterative radix-2 FFT. inverse=true computes the unnormalized inverse.
  function fft(re, im, inverse) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    const sgn = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
      const ang = sgn * TWO_PI / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const xr = re[b] * cr - im[b] * ci;
          const xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  /* Derived, frequency-only quantities. Recomputed when line/material/sweep params change. */
  function prepare(P) {
    const nf = P.nf;
    const fmax = P.fmaxGHz * 1e9;
    const df = fmax / (nf - 1);
    const f = new Float64Array(nf);
    for (let k = 0; k < nf; k++) f[k] = k * df;
    const Dk = P.Dk;
    const lossless = !!P.lossless;
    const ds = makeDS(Dk, lossless ? 0 : P.Df, P.frefGHz * 1e9, P.dsLowHz, P.dsHighHz);
    const sqDk = Math.sqrt(Dk);
    const Lu = sqDk / C0;                     // H/m per ohm
    // conductor: alpha_c [Np/m] at fc for the nominal line -> normalized surface impedance coefficient
    const alphaC = lossless ? 0 : (P.condLoss / 8.685889638) / IN;      // Np/m at condRef
    const kc = 2 * alphaC / Math.sqrt(P.condRefGHz * 1e9);              // per ohm, * sqrt(f)
    const rdcN = lossless ? 0 : (P.rdc / IN) / P.z0;                     // per ohm
    const gRe = new Float64Array(nf), gIm = new Float64Array(nf);        // gamma (1/m)
    const zRe = new Float64Array(nf), zIm = new Float64Array(nf);        // zeta: Zc / Z_nominal
    const epsRe = new Float64Array(nf), epsIm = new Float64Array(nf);
    for (let k = 0; k < nf; k++) {
      const fk = f[k];
      const e = ds.eps(fk);
      epsRe[k] = e[0]; epsIm[k] = e[1];
      if (k === 0) { gRe[k] = 0; gIm[k] = 0; zRe[k] = 1; zIm[k] = 0; continue; }
      const w = TWO_PI * fk;
      const sq = Math.sqrt(fk);
      // series z per ohm: jwLu + rdcN + (1+j) kc sqrt(f)
      const sr = rdcN + kc * sq, si = w * Lu + kc * sq;
      // shunt y per ohm: jw eps / (c sqrt(Dk))
      const yr = -w * e[1] / (C0 * sqDk), yi = w * e[0] / (C0 * sqDk);
      const pr = sr * yr - si * yi, pi = sr * yi + si * yr;
      const g = csqrt(pr, pi);
      gRe[k] = g[0]; gIm[k] = g[1];
      const yy = yr * yr + yi * yi;
      const qr = (sr * yr + si * yi) / yy, qi = (si * yr - sr * yi) / yy;
      const z = csqrt(qr, qi);
      zRe[k] = z[0]; zIm[k] = z[1];
    }
    // Kaiser half-window over [0, fmax], centered on DC (as a symmetric 2N-1 Kaiser window)
    const win = new Float64Array(nf);
    const beta = P.beta, i0b = besselI0(beta);
    for (let k = 0; k < nf; k++) {
      const x = f[k] / fmax;
      win[k] = besselI0(beta * Math.sqrt(Math.max(0, 1 - x * x))) / i0b;
    }
    const M = nextPow2(nf * 8);
    const dt = 1 / (M * df);
    const t0 = Math.round(8 / fmax / dt) * dt; // shift so the zero-phase kernel does not wrap; whole samples, so t = 0 is a sample
    const vRef = C0 / sqDk;
    return {
      P, nf, f, df, fmax, ds, gRe, gIm, zRe, zIm, epsRe, epsIm, win, M, dt, t0,
      vRef, rdcN, kc, Lu,
      lenM: P.lenIn * IN,
      buf: { re: new Float64Array(M), im: new Float64Array(M) },
    };
  }

  /* Build the ordered cascade: runs of equal-Z cells and lumped elements (expanded by count/pitch). */
  function buildCascade(prof, elems, P) {
    const ns = prof.length;
    const dx = P.lenIn / ns;
    const ins = [];
    for (const e of elems) {
      const n = Math.max(1, e.count | 0);
      for (let i = 0; i < n; i++) {
        const x = e.x + i * (e.pitch || 0);
        if (x < -1e-9 || x > P.lenIn + 1e-9) continue;
        const b = Math.min(ns, Math.max(0, Math.round(x / dx)));
        ins.push({ b, e, ord: e.id * 1000 + i });
      }
    }
    ins.sort((a, b) => a.b - b.b || a.ord - b.ord);
    const items = [];
    let ii = 0;
    let i = 0;
    const q = (z) => Math.round(z * 1000) / 1000;
    while (i <= ns) {
      while (ii < ins.length && ins[ii].b === i) { items.push({ kind: 'el', e: ins[ii].e }); ii++; }
      if (i === ns) break;
      // extend run until Z changes or the next insertion boundary
      const nextB = ii < ins.length ? ins[ii].b : ns;
      const z = q(prof[i]);
      let j = i + 1;
      while (j < nextB && q(prof[j]) === z) j++;
      items.push({ kind: 'line', Z: z, m: j - i });
      i = j;
    }
    const ms = [...new Set(items.filter(t => t.kind === 'line').map(t => t.m))];
    const mIndex = new Map(ms.map((m, k) => [m, k]));
    for (const t of items) if (t.kind === 'line') t.mi = mIndex.get(t.m);
    const stubs = [];
    const stubKey = new Map();
    for (const t of items) if (t.kind === 'el' && t.e.type === 'stub') {
      const key = t.e.stubZ + '|' + t.e.stubLen;
      if (!stubKey.has(key)) { stubKey.set(key, stubs.length); stubs.push({ Z: t.e.stubZ, lenM: t.e.stubLen * 1e-3 * IN }); }
      t.si = stubKey.get(key);
    }
    return { items, ms, stubs, dxM: dx * IN };
  }

  /* S-parameters for the cascade at every frequency. */
  function solve(prep, casc) {
    const { nf, f, gRe, gIm, zRe, zIm, rdcN } = prep;
    const P = prep.P;
    const Z1 = P.zTx, Z2 = P.zRx;
    const out = {
      s11r: new Float64Array(nf), s11i: new Float64Array(nf),
      s21r: new Float64Array(nf), s21i: new Float64Array(nf),
      s22r: new Float64Array(nf), s22i: new Float64Array(nf),
    };
    const nm = casc.ms.length;
    const chR = new Float64Array(nm), chI = new Float64Array(nm), shR = new Float64Array(nm), shI = new Float64Array(nm);
    const nst = casc.stubs.length;
    const syR = new Float64Array(nst), syI = new Float64Array(nst);
    const items = casc.items;
    const dxM = casc.dxM;
    const sq12 = Math.sqrt(Z1 * Z2);
    for (let k = 0; k < nf; k++) {
      const w = TWO_PI * f[k];
      const dc = k === 0;
      if (!dc) {
        for (let q = 0; q < nm; q++) {
          const len = casc.ms[q] * dxM;
          const a = gRe[k] * len, b = gIm[k] * len;
          const ea = Math.exp(a), eb = 1 / ea;
          const cha = 0.5 * (ea + eb), sha = 0.5 * (ea - eb);
          const cb = Math.cos(b), sb = Math.sin(b);
          chR[q] = cha * cb; chI[q] = sha * sb;
          shR[q] = sha * cb; shI[q] = cha * sb;
        }
        for (let q = 0; q < nst; q++) {
          // open stub: Y = tanh(gamma l) / (Zs * zeta)
          const len = casc.stubs[q].lenM;
          const a = gRe[k] * len, b = gIm[k] * len;
          const ea = Math.exp(a), eb = 1 / ea;
          const cha = 0.5 * (ea + eb), sha = 0.5 * (ea - eb);
          const cb = Math.cos(b), sb = Math.sin(b);
          const cr = cha * cb, ci = sha * sb, sr = sha * cb, si = cha * sb;
          const den = cr * cr + ci * ci;
          const tr = (sr * cr + si * ci) / den, ti = (si * cr - sr * ci) / den;
          const Zr = casc.stubs[q].Z * zRe[k], Zi = casc.stubs[q].Z * zIm[k];
          const d2 = Zr * Zr + Zi * Zi;
          syR[q] = (tr * Zr + ti * Zi) / d2; syI[q] = (ti * Zr - tr * Zi) / d2;
        }
      }
      // accumulated ABCD
      let ar = 1, ai = 0, br = 0, bi = 0, cr = 0, ci = 0, dr = 1, di = 0;
      for (let t = 0; t < items.length; t++) {
        const it = items[t];
        if (it.kind === 'line') {
          if (dc) {
            const R = it.Z * rdcN * it.m * dxM; // series Rdc
            br += ar * R; bi += ai * R; dr += cr * R; di += ci * R;
            continue;
          }
          const q = it.mi;
          const Ar = chR[q], Ai = chI[q];
          const Zcr = it.Z * zRe[k], Zci = it.Z * zIm[k];
          const Br = Zcr * shR[q] - Zci * shI[q], Bi = Zcr * shI[q] + Zci * shR[q];
          const zz = Zcr * Zcr + Zci * Zci;
          const Cr = (shR[q] * Zcr + shI[q] * Zci) / zz, Ci = (shI[q] * Zcr - shR[q] * Zci) / zz;
          // [a b; c d] * [A B; C A]
          const nar = ar * Ar - ai * Ai + br * Cr - bi * Ci;
          const nai = ar * Ai + ai * Ar + br * Ci + bi * Cr;
          const nbr = ar * Br - ai * Bi + br * Ar - bi * Ai;
          const nbi = ar * Bi + ai * Br + br * Ai + bi * Ar;
          const ncr = cr * Ar - ci * Ai + dr * Cr - di * Ci;
          const nci = cr * Ai + ci * Ar + dr * Ci + di * Cr;
          const ndr = cr * Br - ci * Bi + dr * Ar - di * Ai;
          const ndi = cr * Bi + ci * Br + dr * Ai + di * Ar;
          ar = nar; ai = nai; br = nbr; bi = nbi; cr = ncr; ci = nci; dr = ndr; di = ndi;
        } else {
          const e = it.e;
          let sZr = 0, sZi = 0, sYr = 0, sYi = 0, series = false;
          if (e.type === 'R') { series = true; sZr = e.value; }
          else if (e.type === 'L') { series = true; sZi = w * e.value * 1e-9; }
          else if (e.type === 'C') { sYi = w * e.value * 1e-12; }
          else if (e.type === 'stub') { if (!dc) { sYr = syR[it.si]; sYi = syI[it.si]; } }
          if (series) {
            // [a b; c d] * [1 Z; 0 1] -> b += a Z, d += c Z
            br += ar * sZr - ai * sZi; bi += ar * sZi + ai * sZr;
            dr += cr * sZr - ci * sZi; di += cr * sZi + ci * sZr;
          } else {
            // [a b; c d] * [1 0; Y 1] -> a += b Y, c += d Y
            ar += br * sYr - bi * sYi; ai += br * sYi + bi * sYr;
            cr += dr * sYr - di * sYi; ci += dr * sYi + di * sYr;
          }
        }
      }
      // ABCD -> S with real reference impedances Z1 (port 1) and Z2 (port 2)
      const Dr = ar * Z2 + br + cr * Z1 * Z2 + dr * Z1;
      const Di = ai * Z2 + bi + ci * Z1 * Z2 + di * Z1;
      const den = Dr * Dr + Di * Di;
      const n11r = ar * Z2 + br - cr * Z1 * Z2 - dr * Z1;
      const n11i = ai * Z2 + bi - ci * Z1 * Z2 - di * Z1;
      out.s11r[k] = (n11r * Dr + n11i * Di) / den; out.s11i[k] = (n11i * Dr - n11r * Di) / den;
      const n22r = -ar * Z2 + br - cr * Z1 * Z2 + dr * Z1;
      const n22i = -ai * Z2 + bi - ci * Z1 * Z2 + di * Z1;
      out.s22r[k] = (n22r * Dr + n22i * Di) / den; out.s22i[k] = (n22i * Dr - n22r * Di) / den;
      out.s21r[k] = 2 * sq12 * Dr / den; out.s21i[k] = -2 * sq12 * Di / den;
    }
    return out;
  }

  /* Band-limited TDR step response (rho) from S11 via Kaiser-windowed inverse FFT. */
  function tdr(prep, sr, si, tMaxRT) {
    const { nf, f, win, M, dt, t0 } = prep;
    const re = prep.buf.re, im = prep.buf.im;
    re.fill(0); im.fill(0);
    for (let k = 0; k < nf; k++) {
      const ph = -TWO_PI * f[k] * t0;
      const c = Math.cos(ph), s = Math.sin(ph);
      const xr = (sr[k] * c - si[k] * s) * win[k];
      const xi = (sr[k] * s + si[k] * c) * win[k];
      re[k] = xr; im[k] = k === 0 ? 0 : xi;
      if (k > 0) { re[M - k] = xr; im[M - k] = -xi; }
    }
    fft(re, im, true);
    const n0 = Math.round(t0 / dt);
    const nOut = Math.min(M - 1, n0 + Math.ceil(tMaxRT / dt) + 1);
    const t = new Float64Array(nOut), rho = new Float64Array(nOut);
    // Step = running integral of the impulse response, by the trapezoid rule (as scikit-rf's step_response).
    // A plain running sum would place every edge half a sample (dt/2) early.
    let acc = 0;
    const y0 = re[0] / M;
    for (let n = 0; n < nOut; n++) {
      const yn = re[n] / M;
      acc += yn;
      t[n] = n * dt - t0;
      rho[n] = acc - 0.5 * (y0 + yn);
    }
    return { t, rho };
  }

  /* 10-90 % rise time of the windowed step (S11 = 1). */
  function riseTime(prep) {
    const one = new Float64Array(prep.nf).fill(1), zero = new Float64Array(prep.nf);
    const r = tdr(prep, one, zero, 20 / prep.fmax);
    let t10 = NaN, t90 = NaN;
    for (let n = 1; n < r.rho.length; n++) {
      if (isNaN(t10) && r.rho[n] >= 0.1) t10 = r.t[n - 1] + (0.1 - r.rho[n - 1]) / (r.rho[n] - r.rho[n - 1]) * (r.t[n] - r.t[n - 1]);
      if (isNaN(t90) && r.rho[n] >= 0.9) { t90 = r.t[n - 1] + (0.9 - r.rho[n - 1]) / (r.rho[n] - r.rho[n - 1]) * (r.t[n] - r.t[n - 1]); break; }
    }
    return t90 - t10;
  }

  /* Least-squares fit IL(f) = a0 + a1 sqrt(f) + a2 f + a4 f^2 (f in GHz) over (0, fmax]; returns fit and ILD. */
  function ildFit(f, ilDb) {
    const n = f.length;
    const A = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], b = [0, 0, 0, 0];
    const basis = (x) => [1, Math.sqrt(x), x, x * x];
    for (let k = 1; k < n; k++) {
      const x = f[k] / 1e9, v = basis(x);
      for (let i = 0; i < 4; i++) { b[i] += v[i] * ilDb[k]; for (let j = 0; j < 4; j++) A[i][j] += v[i] * v[j]; }
    }
    // Gaussian elimination with partial pivoting
    for (let c = 0; c < 4; c++) {
      let p = c;
      for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = c + 1; r < 4; r++) {
        const m = A[r][c] / A[c][c];
        for (let j = c; j < 4; j++) A[r][j] -= m * A[c][j];
        b[r] -= m * b[c];
      }
    }
    const a = [0, 0, 0, 0];
    for (let c = 3; c >= 0; c--) { let s = b[c]; for (let j = c + 1; j < 4; j++) s -= A[c][j] * a[j]; a[c] = s / A[c][c]; }
    const fit = new Float64Array(n), ild = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const v = basis(f[k] / 1e9);
      fit[k] = a[0] * v[0] + a[1] * v[1] + a[2] * v[2] + a[3] * v[3];
      ild[k] = k === 0 ? NaN : ilDb[k] - fit[k];
    }
    return { a, fit, ild };
  }

  /* Equivalent lumped L or C of painted excursions (HP Journal / Dascher TDR area method). */
  function excursions(prof, P, thresh) {
    const ns = prof.length, z0 = P.z0;
    const tauSeg = (P.lenIn * IN / ns) * Math.sqrt(P.Dk) / C0; // one-way delay per cell
    const out = [];
    let i = 0;
    while (i < ns) {
      if (Math.abs(prof[i] - z0) <= thresh) { i++; continue; }
      const sign = Math.sign(prof[i] - z0);
      let j = i, area = 0, peak = 0, sumZ = 0;
      while (j < ns && Math.abs(prof[j] - z0) > thresh && Math.sign(prof[j] - z0) === sign) {
        const rho = (prof[j] - z0) / (prof[j] + z0);
        area += rho * 2 * tauSeg; // integral of rho over round-trip time
        if (Math.abs(prof[j] - z0) > Math.abs(peak - z0) || peak === 0) peak = prof[j];
        sumZ += prof[j];
        j++;
      }
      out.push({
        i0: i, i1: j, sign, peak, avgZ: sumZ / (j - i),
        delay: (j - i) * tauSeg,
        L: area > 0 ? 2 * z0 * area : 0,          // H
        C: area < 0 ? -2 * area / z0 : 0,         // F
      });
      i = j;
    }
    return out;
  }

  const api = { C0, IN, makeDS, prepare, buildCascade, solve, tdr, riseTime, ildFit, excursions, fft, besselI0 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TDREngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
