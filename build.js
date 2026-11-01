#!/usr/bin/env node
// Inlines src/engine.js into src/page.html and writes two single-file builds:
//   dist/index.html                 standalone page (open in a browser, or serve with GitHub Pages)
//   dist/tdr-painter.artifact.html  head-less fragment for a claude.ai Artifact (the host adds the skeleton)
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const rd = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(rd('package.json'));
const engine = rd('src/engine.js');
const page = rd('src/page.html')
  .replace('/*ENGINE*/', () => engine)
  .replace(/__VERSION__/g, pkg.version);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/tdr-painter.artifact.html'), page);

// Standalone: move the leading <title>/<meta>/<link>/<style> block into <head>.
const cut = page.indexOf('</style>') + '</style>'.length;
const head = page.slice(0, cut);
const body = page.slice(cut);
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
${head}
</head>
<body>${body}
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'dist/index.html'), standalone);
console.log(`built v${pkg.version}: dist/index.html (${standalone.length} B), dist/tdr-painter.artifact.html (${page.length} B)`);
