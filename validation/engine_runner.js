#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Giorgi Maghlakelidze. Part of TDR Painter (Sparamix).
// Runs TDR Painter's own engine on project files, exactly as the page does, and prints the results as JSON.
// Used by validation/run_validation.py; nothing here re-implements physics.
//
//   node validation/engine_runner.js jobs.json > results.json
//
// jobs.json: [{ "id": "...", "project": { ...tdr-painter-project... }, "tdrSpanIn": 3.0 }, ...]
// For each job: frequency grid, S11/S21/S22 (re, im), the TDR (time, distance, impedance) and the 10-90 % rise
// time, plus any parameter the project parser had to clamp (which the validation treats as an error).
'use strict';
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));
const PJ = require(path.join(__dirname, '..', 'src', 'project.js'));

const NS = 500;   // cells, same as the page
const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const arr = (a) => Array.from(a);

const out = jobs.map((job) => {
  const p = PJ.parse(job.project, NS);
  const clamped = [];
  for (const k of Object.keys(PJ.DEFAULTS)) {
    const given = job.project.params && job.project.params[k];
    if (given !== undefined && given !== p.P[k]) clamped.push(`${k}: ${given} -> ${p.P[k]}`);
  }
  if ((job.project.elements || []).length !== p.elements.length) clamped.push('elements dropped');
  const elems = p.elements.map((e, i) => ({ id: i + 1, ...e }));   // ids in file order, as the page assigns them
  const prep = E.prepare(p.P);
  const s = E.solve(prep, E.buildCascade(p.prof, elems, p.P));
  const span = job.tdrSpanIn || 1.2 * p.P.lenIn;
  const td = E.tdr(prep, s.s11r, s.s11i, 2 * span * E.IN / prep.vRef);
  return {
    id: job.id, clamped,
    f: arr(prep.f), vRef: prep.vRef, riseTime: E.riseTime(prep), epsInf: prep.ds.epsInf,
    s11r: arr(s.s11r), s11i: arr(s.s11i), s21r: arr(s.s21r), s21i: arr(s.s21i), s22r: arr(s.s22r), s22i: arr(s.s22i),
    tdr: {
      t: arr(td.t), rho: arr(td.rho),
      x: arr(td.t).map(t => t / 2 * prep.vRef / E.IN),
      z: arr(td.rho).map(r => p.P.zTx * (1 + r) / (1 - r)),
    },
    profile: arr(p.prof),
  };
});
process.stdout.write(JSON.stringify(out));
