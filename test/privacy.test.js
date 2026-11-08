// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Giorgi Maghlakelidze. Part of TDR Painter (Sparamix).
// Static privacy check of the built pages. Fails if the shipped code could talk to a server or keep data
// in the browser. Run after `npm run build` (npm test does both).
'use strict';
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
let fails = 0;
const check = (name, ok, detail) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

// Network and storage APIs the page must never use.
const FORBIDDEN = [
  /\bfetch\s*\(/, /XMLHttpRequest/, /\bWebSocket\b/, /\bEventSource\b/, /sendBeacon/, /RTCPeerConnection/,
  /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /document\.cookie/, /\bcaches\b\./,
  /serviceWorker/, /\bimportScripts\b/, /<iframe/i, /<form\b/i, /\bnew\s+Image\s*\(/, /\bwindow\.open\s*\(/,
];

for (const file of ['index.html', 'tdr-painter.artifact.html']) {
  const html = fs.readFileSync(path.join(dist, file), 'utf8');
  for (const re of FORBIDDEN) check(`${file}: no ${re.source}`, !re.test(html));
  const urls = (html.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"')<>]*/gi) || []);
  check(`${file}: no external URLs`, urls.length === 0, urls.slice(0, 5).join(' '));
  check(`${file}: no external src/href`, !/\b(?:src|href)\s*=\s*["']?(?!data:|#|blob:)[a-z]+:/i.test(html));
}

const standalone = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const csp = (standalone.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
const headEnd = standalone.indexOf('</head>');
check('index.html: CSP meta is inside <head>', csp && standalone.indexOf('Content-Security-Policy') < headEnd);
for (const d of ["default-src 'none'", "connect-src 'none'", "form-action 'none'", "base-uri 'none'"])
  check(`index.html: CSP has ${d}`, csp.includes(d));
check("index.html: CSP allows nothing remote", !/https?:|\*/.test(csp), csp);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
