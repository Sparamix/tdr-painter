// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Giorgi Maghlakelidze. Part of TDR Painter (Sparamix).
// Checks every file in examples/: it must open with the page's own parser without anything being clamped,
// carry an example block, and simulate to finite, passive S-parameters. Community submissions run through
// exactly this, so a PR that passes `npm test` will load and behave in the page.
'use strict';
const fs = require('fs');
const path = require('path');
const PJ = require(path.join(__dirname, '..', 'src', 'project.js'));
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));

const NS = 500;
const dir = path.join(__dirname, '..', 'examples');
let fails = 0;
const check = (name, ok, detail) => {
  if (!ok) fails++;
  if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + detail : ''}`);
};

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
let defaults = 0;
const names = new Set();
for (const f of files) {
  const tag = `${f}:`;
  let obj;
  try { obj = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { check(`${tag} valid JSON`, false, e.message); continue; }
  check(`${tag} file name is NN-slug.json`, /^\d\d-[a-z0-9-]+\.json$/.test(f));
  let p;
  try { p = PJ.parse(obj, NS); } catch (e) { check(`${tag} opens`, false, e.message); continue; }
  const ex = obj.example || {};
  check(`${tag} has an example block`, !!obj.example);
  check(`${tag} category is one of ${PJ.CATEGORIES.join(', ')}`, PJ.CATEGORIES.includes(ex.category), ex.category);
  check(`${tag} note is 40 to 600 characters`, typeof ex.note === 'string' && ex.note.length >= 40 && ex.note.length <= 600, ex.note && ex.note.length);
  check(`${tag} name is set and unique`, p.name.length > 0 && !names.has(p.name), p.name);
  names.add(p.name);
  if (ex.default === true) defaults++;

  // nothing may be clamped: the file must already be within the page's limits
  // (true/false flags such as extremeZ may be left out, which means false)
  for (const k of Object.keys(PJ.DEFAULTS)) {
    const given = obj.params && obj.params[k];
    const ok = PJ.FLAGS.includes(k) ? (given === undefined || given === p.P[k]) : given === p.P[k];
    check(`${tag} params.${k} present and within limits`, ok, `${given} -> ${p.P[k]}`);
  }
  const lim = PJ.limits(p.P.extremeZ);
  const runs = obj.profile && obj.profile.runs || [];
  check(`${tag} profile covers ${NS} cells`, obj.profile && obj.profile.cells === NS && runs.reduce((s, r) => s + r[1], 0) === NS);
  check(`${tag} profile impedances within limits`, runs.every(r => r[0] >= lim.prof[0] && r[0] <= lim.prof[1]));
  check(`${tag} every element kept`, (obj.elements || []).length === p.elements.length);
  (obj.elements || []).forEach((e, i) => {
    const q = p.elements[i] || {};
    const same = ['type', 'x', 'count', 'pitch'].every(k => e[k] === q[k]) &&
      (e.type === 'stub' ? e.stubZ === q.stubZ && e.stubLen === q.stubLen && (e.end || 'open') === q.end : e.value === q.value);
    check(`${tag} element ${i} (${e.type}) within limits`, same);
  });

  // physics: finite and passive at every frequency, from both ports
  const prep = E.prepare(p.P);
  const s = E.solve(prep, E.buildCascade(p.prof, p.elements.map((e, i) => ({ id: i + 1, ...e })), p.P));
  let finite = true, worst = 0;
  for (let k = 0; k < prep.nf; k++) {
    const a = s.s11r[k] ** 2 + s.s11i[k] ** 2, b = s.s21r[k] ** 2 + s.s21i[k] ** 2, c = s.s22r[k] ** 2 + s.s22i[k] ** 2;
    if (!isFinite(a + b + c)) finite = false;
    worst = Math.max(worst, a + b - 1, c + b - 1);
  }
  check(`${tag} S-parameters finite`, finite);
  check(`${tag} passive (|S11|²+|S21|² ≤ 1)`, worst <= 1e-9, worst.toExponential(2));
}
check('exactly one example is marked default', defaults === 1, defaults);
console.log(`${files.length} examples checked`);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
