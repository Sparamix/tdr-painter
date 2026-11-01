#!/usr/bin/env node
// Inlines src/engine.js and the self-hosted fonts into src/page.html and writes two single-file builds:
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
const page = rd('src/page.html')
  .replace('/*FONTS*/', () => fontsCss)
  .replace('/*ENGINE*/', () => engine)
  .replace(/__VERSION__/g, pkg.version);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/tdr-painter.artifact.html'), page);

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
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="data:,">
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
