/* Project format: defaults, limits, profile encoding and the validating parser.
 * Shared by the page and the tests, so examples submitted as .json files are checked by exactly
 * the code that will open them. A project file is untrusted input: every value is clamped.
 */
(function (root) {
  'use strict';

  const FORMAT = 'tdr-painter-project';
  const FORMAT_VERSION = 1;

  const DEFAULTS = {
    lenIn: 2, z0: 50, Dk: 3.35, Df: 0.004, frefGHz: 12, dsLowHz: 1e3, dsHighHz: 1e12,
    condLoss: 0.4, condRefGHz: 10, rdc: 0.2, fmaxGHz: 50, nf: 1001,
    zTx: 50, zRx: 50, beta: 4.2, lossless: false, condLossless: false, dielLossless: false, extremeZ: false,
  };
  const FLAGS = ['lossless', 'condLossless', 'dielLossless', 'extremeZ'];   // booleans; a missing flag means false
  /** lossless (from v0.7.0 and earlier) means both; afterwards it is kept equal to condLossless && dielLossless. */
  function normalizeLoss(P) {
    if (P.lossless) { P.condLossless = true; P.dielLossless = true; }
    P.lossless = !!(P.condLossless && P.dielLossless);
    return P;
  }
  // Same ranges as the page's sliders (stored in base units: Hz, inches, ohms).
  const LIMITS = {
    lenIn: [0.25, 10], z0: [20, 120], Dk: [1, 6], Df: [0, 0.03], frefGHz: [0.1, 60],
    dsLowHz: [10, 1e6], dsHighHz: [1e11, 1e13], condLoss: [0, 2], condRefGHz: [10, 10], rdc: [0, 2],
    fmaxGHz: [5, 110], nf: [1001, 1001], zTx: [10, 150], zRx: [10, 150], beta: [0, 14],
  };
  const Z_LIMITS = [5, 200];
  // Experimental "Allow extra low and high impedances" (params.extremeZ): ports, painted profile, stub
  // impedance and series R may go from 1 mohm (a short) to 1 Mohm (an open).
  const WIDE = [0.001, 1e6];
  const ELEMENT = {
    types: ['C', 'L', 'R', 'stub', 'pad'],
    value: { C: [0.005, 1], L: [0.01, 2], R: [0.01, 25], pad: [0.1, 60] },     // pF, nH, ohm, dB
    padZ: [5, 500],                                                         // attenuator image impedances, ohm
    stubZ: [20, 90], stubLen: [2, 250], count: [1, 30], pitch: [0.02, 1],
  };
  const CATEGORIES = ['Basics', 'Discontinuities', 'TDR artifacts', 'Realistic channels', 'Community'];

  /** The impedance limits that apply to a project, by its extremeZ flag. */
  function limits(extremeZ) {
    return extremeZ
      ? { port: WIDE, prof: WIDE, stubZ: WIDE, R: WIDE }
      : { port: LIMITS.zTx, prof: Z_LIMITS, stubZ: ELEMENT.stubZ, R: ELEMENT.value.R };
  }
  /** Impedance as stored: 1 mohm steps from 1 ohm up, four significant digits below 1 ohm. The engine uses the same rule. */
  const quantZ = (z) => z >= 1 ? Math.round(z * 1000) / 1000 : +z.toPrecision(4);

  const num = (v, lo, hi, dflt) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, v)) : dflt;
  const text = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';

  /** Run-length encode a profile as [[ohms, cells], ...], rounded by quantZ. */
  function encodeProfile(prof) {
    const runs = [];
    for (let i = 0; i < prof.length;) {
      const z = quantZ(prof[i]);
      let j = i + 1;
      while (j < prof.length && quantZ(prof[j]) === z) j++;
      runs.push([z, j - i]);
      i = j;
    }
    return runs;
  }

  /** Validate a parsed project object. Returns {name, P, prof, elements, view, example}; throws Error with a readable message. */
  function parse(obj, ns) {
    if (!obj || typeof obj !== 'object' || obj.format !== FORMAT) throw new Error('That file isn’t a TDR Painter project.');
    if ((obj.formatVersion | 0) > FORMAT_VERSION) throw new Error(`That project was saved by a newer TDR Painter (format ${obj.formatVersion | 0}). Update the page to open it.`);
    const P = { ...DEFAULTS };
    const src = obj.params && typeof obj.params === 'object' ? obj.params : {};
    for (const k of FLAGS) P[k] = src[k] === true;
    normalizeLoss(P);
    const lim = limits(P.extremeZ);
    for (const k of Object.keys(DEFAULTS)) {
      if (FLAGS.includes(k)) continue;
      const r = k === 'zTx' || k === 'zRx' ? lim.port : LIMITS[k];
      P[k] = num(src[k], r[0], r[1], DEFAULTS[k]);
    }
    const runs = obj.profile && Array.isArray(obj.profile.runs) ? obj.profile.runs : null;
    const cells = [];
    if (runs) for (const r of runs) {
      if (!Array.isArray(r)) continue;
      const z = num(r[0], lim.prof[0], lim.prof[1], P.z0);
      const n = Math.max(0, Math.min(100000 - cells.length, Math.round(r[1]) || 0));
      for (let k = 0; k < n; k++) cells.push(z);
      if (cells.length >= 100000) break;
    }
    if (!cells.length) throw new Error('That project has no impedance profile.');
    const prof = new Float64Array(ns);   // resample if the file uses a different cell count
    for (let i = 0; i < ns; i++) prof[i] = cells[Math.min(cells.length - 1, Math.floor((i + 0.5) / ns * cells.length))];
    const elements = [];
    for (const e of Array.isArray(obj.elements) ? obj.elements.slice(0, 200) : []) {
      if (!e || typeof e !== 'object' || !ELEMENT.types.includes(e.type)) continue;
      const o = {
        type: e.type, x: num(e.x, 0, P.lenIn, 0),
        count: Math.round(num(e.count, ELEMENT.count[0], ELEMENT.count[1], 1)),
        pitch: num(e.pitch, ELEMENT.pitch[0], ELEMENT.pitch[1], 0.15), locked: e.locked === true, enabled: e.enabled !== false,
      };
      if (e.type === 'stub') {
        o.value = 0;
        o.stubZ = num(e.stubZ, lim.stubZ[0], lim.stubZ[1], 45);
        o.stubLen = Math.round(num(e.stubLen, ELEMENT.stubLen[0], ELEMENT.stubLen[1], 60) * 100) / 100;   // 0.01 mil steps
        o.end = e.end === 'short' ? 'short' : 'open';
      } else if (e.type === 'pad') {
        // resistive attenuator: Zin faces Tx, Zout faces Rx; the engine raises the loss to the minimum-loss pad if needed
        o.value = num(e.value, ELEMENT.value.pad[0], ELEMENT.value.pad[1], 6);
        o.zIn = num(e.zIn, ELEMENT.padZ[0], ELEMENT.padZ[1], 50);
        o.zOut = num(e.zOut, ELEMENT.padZ[0], ELEMENT.padZ[1], 50);
      } else {
        const r = e.type === 'R' ? lim.R : ELEMENT.value[e.type];
        o.value = num(e.value, r[0], r[1], r[0]);
      }
      elements.push(o);
    }
    const v = obj.view || {};
    const log = v.log === true;
    const span = v.zMax - v.zMin;
    const viewOk = typeof v.zMin === 'number' && typeof v.zMax === 'number' && isFinite(v.zMin) && isFinite(v.zMax) && (log
      ? v.zMin >= 1e-4 && v.zMax <= 1e7 && v.zMax / v.zMin >= 1.2
      : span >= (P.extremeZ ? 0.01 : 1) && span < (P.extremeZ ? 2e6 : 1000));
    const view = viewOk ? { zMin: v.zMin, zMax: v.zMax, log } : null;
    const ex = obj.example && typeof obj.example === 'object' ? obj.example : null;
    const example = ex ? {
      category: CATEGORIES.includes(ex.category) ? ex.category : 'Community',
      note: text(ex.note, 600), author: text(ex.author, 80), order: num(ex.order, -1e6, 1e6, 1000), isDefault: ex.default === true,
    } : null;
    // display units only: everything in the file stays in inches either way
    const units = v.units === 'metric' || v.units === 'imperial' ? v.units : null;
    return { name: text(obj.name, 80), P, prof, elements, view, units, example };
  }

  const api = { FORMAT, FORMAT_VERSION, DEFAULTS, FLAGS, LIMITS, Z_LIMITS, WIDE, ELEMENT, CATEGORIES, limits, quantZ, normalizeLoss, encodeProfile, parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TDRProject = api;
})(typeof window !== 'undefined' ? window : globalThis);
