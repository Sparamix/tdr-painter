#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Giorgi Maghlakelidze. Part of TDR Painter (Sparamix).
// Inlines src/engine.js, src/tdrp.js, src/project.js, examples/*.json and the self-hosted fonts into src/page.html and writes two single-file builds:
//   dist/index.html                 standalone page (open from disk, or serve with GitHub Pages);
//                                   carries a Content-Security-Policy that blocks every network connection
//   dist/tdr-painter.artifact.html  head-less fragment for a claude.ai Artifact (the host adds the skeleton)
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const rd = (p, enc = 'utf8') => fs.readFileSync(path.join(root, p), enc);
const pkg = JSON.parse(rd('package.json'));

// fonts/fonts.css with every url(file.woff2) replaced by a data: URI
const fontsCss = rd('fonts/fonts.css').replace(/url\(([\w.-]+\.woff2)\)/g, (_, f) =>
  `url(data:font/woff2;base64,${rd(path.join('fonts', f), null).toString('base64')})`);

const engine = rd('src/engine.js');
const tdrp = rd('src/tdrp.js');
const project = rd('src/project.js');
// examples/*.json, in file-name order; '<' escaped so no string can close the <script>
const examples = fs.readdirSync(path.join(root, 'examples')).filter(f => f.endsWith('.json')).sort()
  .map(f => JSON.parse(rd(path.join('examples', f))));
const examplesJs = examples.map(e => JSON.stringify(e).replace(/</g, '\\u003c')).join(',\n');
const page = rd('src/page.html')
  .replace('/*FONTS*/', () => fontsCss)
  .replace('/*ENGINE*/', () => engine)
  .replace('/*TDRP*/', () => tdrp)
  .replace('/*PROJECT*/', () => project)
  .replace('[/*EXAMPLES*/]', () => '[\n' + examplesJs + '\n]')
  .replace(/__VERSION__/g, pkg.version);

// Favicon: the icon from doc/icon.svg as a data: URI, with a light frame in dark browser chrome
const FAVICON = "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 300%22%3E%3Cstyle%3E.f%7Bstroke:#000046;fill:#000046%7D.b%7Bstroke:#000046;fill:#fff%7D%40media (prefers-color-scheme:dark)%7B.f%7Bstroke:#C9D6FF;fill:#C9D6FF%7D.b%7Bstroke:#C9D6FF%7D%7D%3C/style%3E%3Cline class=%22f%22 x1=%2222%22 y1=%22100%22 x2=%2252%22 y2=%22100%22 stroke-width=%2210%22/%3E%3Ccircle class=%22f%22 cx=%2222%22 cy=%22100%22 r=%2212%22/%3E%3Cline class=%22f%22 x1=%22248%22 y1=%22100%22 x2=%22278%22 y2=%22100%22 stroke-width=%2210%22/%3E%3Ccircle class=%22f%22 cx=%22278%22 cy=%22100%22 r=%2212%22/%3E%3Cline class=%22f%22 x1=%2222%22 y1=%22200%22 x2=%2252%22 y2=%22200%22 stroke-width=%2210%22/%3E%3Ccircle class=%22f%22 cx=%2222%22 cy=%22200%22 r=%2212%22/%3E%3Cline class=%22f%22 x1=%22248%22 y1=%22200%22 x2=%22278%22 y2=%22200%22 stroke-width=%2210%22/%3E%3Ccircle class=%22f%22 cx=%22278%22 cy=%22200%22 r=%2212%22/%3E%3Crect class=%22b%22 x=%2252%22 y=%2252%22 width=%22196%22 height=%22196%22 stroke-width=%2210%22/%3E%3Cpath d=%22M 60 158 L 92 158 C 104 158, 106 196, 120 196 C 134 196, 134 158, 146 158 L 150 158 C 160 158, 162 104, 176 104 C 190 104, 190 158, 202 158 L 240 158%22 fill=%22none%22 stroke=%22#AACCFF%22 stroke-width=%2234%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3Cpath d=%22M 60 158 L 92 158 C 104 158, 106 196, 120 196 C 134 196, 134 158, 146 158 L 150 158 C 160 158, 162 104, 176 104 C 190 104, 190 158, 202 158 L 240 158%22 fill=%22none%22 stroke=%22#000046%22 stroke-width=%229%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E";

// License notice at the top of both builds: the page is its own complete source.
const NOTICE = `<!--
  TDR Painter v${pkg.version}, part of Sparamix. Copyright (C) 2026 Giorgi Maghlakelidze.
  SPDX-License-Identifier: GPL-3.0-or-later
  Free software: you can redistribute it and/or modify it under the terms of the GNU General Public License,
  version 3 or (at your option) any later version. It comes with ABSOLUTELY NO WARRANTY.
  The code in this file is not minified. The full source, with build scripts and tests, is at github.com/Sparamix/tdr-painter.
  Embedded fonts (Archivo, Instrument Sans, JetBrains Mono) are under the SIL Open Font License 1.1.
-->
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/tdr-painter.artifact.html'), NOTICE + page);

// No connections of any kind: no fetch/XHR/WebSocket/beacon, no external scripts, styles, fonts or images,
// no form posts. Inline script and style only; fonts and the favicon are data: URIs.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'font-src data:',
  'img-src data:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

// Standalone: the leading <title>/<meta>/<style> block goes into <head>.
const cut = page.indexOf('<div class="wrap">');
if (cut < 0) throw new Error('src/page.html: <div class="wrap"> not found');
const head = page.slice(0, cut).trim();
const body = page.slice(cut);
const standalone = `<!doctype html>
${NOTICE}<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" type="image/svg+xml" href="${FAVICON}">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'dist/index.html'), standalone);
console.log(`built v${pkg.version}: dist/index.html (${(standalone.length / 1024).toFixed(0)} KiB), dist/tdr-painter.artifact.html (${(page.length / 1024).toFixed(0)} KiB)`);
