// Tests for the .tdrp container (src/tdrp.js): round trip, interop with Python's zipfile,
// and refusal of damaged, truncated, foreign, encrypted and oversized archives.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const T = require(path.join(__dirname, '..', 'src', 'tdrp.js'));

let fails = 0;
const check = (name, ok, detail) => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + detail : ''}`);
};
const enc = new TextEncoder(), dec = new TextDecoder();
async function code(p) { try { await p; return 'ok'; } catch (e) { return e.code || String(e); } }
const py = (script, ...args) => spawnSync('python3', ['-c', script, ...args], { encoding: 'utf8' });
const hasPython = py('import zipfile').status === 0;

(async () => {
  // a realistic project body: profile runs vary, so it compresses like a real file
  const project = {
    format: 'tdr-painter-project', formatVersion: 1, name: 'Via stub study',
    profile: { cells: 500, runs: Array.from({ length: 300 }, (_, i) => [+(50 + 6 * Math.sin(i / 9)).toFixed(3), 1 + (i % 3)]) },
    elements: [{ type: 'stub', x: 1, stubZ: 45, stubLen: 60, count: 1, pitch: 0.15, locked: true }],
  };
  const json = enc.encode(JSON.stringify(project));
  const zip = await T.write([{ name: 'project.json', data: json }]);

  check('archive starts with a ZIP local header', T.isZip(zip));
  check('entry is deflated (method 8)', zip[8] === 8);
  check('compressed archive is smaller than the JSON', zip.length < json.length, `${json.length} -> ${zip.length} B`);
  const back = await T.read(zip, 'project.json');
  check('round trip is byte-identical', dec.decode(back) === dec.decode(json));

  const tiny = await T.write([{ name: 'project.json', data: enc.encode('{}') }]);
  check('tiny entry is stored (method 0)', tiny[8] === 0);
  check('stored entry round trips', dec.decode(await T.read(tiny, 'project.json')) === '{}');

  // damage
  const flipData = zip.slice(); flipData[60] ^= 0x04;
  check('flipped data byte is refused as damaged', await code(T.read(flipData, 'project.json')) === 'damaged');
  const cd = zip.length - 22 - (46 + 'project.json'.length);
  const flipCrc = zip.slice(); flipCrc[cd + 16] ^= 0x01;
  check('wrong CRC is refused as damaged', await code(T.read(flipCrc, 'project.json')) === 'damaged');
  check('truncated file is refused as damaged', await code(T.read(zip.slice(0, zip.length - 30), 'project.json')) === 'damaged');
  check('half a file is refused as damaged', await code(T.read(zip.slice(0, zip.length >> 1), 'project.json')) === 'damaged');
  check('JSON bytes are not taken for a .tdrp', await code(T.read(json, 'project.json')) === 'not_zip');
  const enc1 = zip.slice(); enc1[cd + 8] |= 1;
  check('encrypted entry is refused', await code(T.read(enc1, 'project.json')) === 'unsupported');
  const other = await T.write([{ name: 'notes.txt', data: enc.encode('hello') }]);
  check('archive without project.json is refused', await code(T.read(other, 'project.json')) === 'not_project');

  if (!hasPython) { console.log('SKIP  Python interop checks (python3 not found)'); }
  else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tdrp-'));
    const ours = path.join(dir, 'ours.tdrp');
    fs.writeFileSync(ours, zip);
    const r = py(`import zipfile,sys
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; sys.stdout.write(z.read('project.json').decode())`, ours);
    check('Python zipfile reads our .tdrp and its CRC checks out', r.status === 0 && r.stdout === dec.decode(json), r.stderr.trim().split('\n').pop());

    const theirs = path.join(dir, 'theirs.zip');
    py(`import zipfile,sys
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z: z.writestr('project.json', sys.argv[2])`, theirs, dec.decode(json));
    const fromPy = await T.read(new Uint8Array(fs.readFileSync(theirs)), 'project.json');
    check('we read a ZIP written by Python', dec.decode(fromPy) === dec.decode(json));

    // zip bomb: 20 MB of zeros, and the same with a lying (small) declared size
    const bomb = path.join(dir, 'bomb.zip');
    py(`import zipfile,sys
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z: z.writestr('project.json', b'0' * 20_000_000)`, bomb);
    const b = new Uint8Array(fs.readFileSync(bomb));
    check(`declared-huge entry is refused (${b.length} B archive)`, await code(T.read(b, 'project.json')) === 'too_large');
    const liar = b.slice();
    const dv = new DataView(liar.buffer);
    const end = liar.length - 22, cdOff = dv.getUint32(end + 16, true);
    dv.setUint32(cdOff + 24, 100, true);
    check('lying size is caught while inflating', await code(T.read(liar, 'project.json')) === 'too_large');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  check('CRC-32 of "123456789" is CBF43926', T.crc32(enc.encode('123456789')) === 0xcbf43926);
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})();
