// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Giorgi Maghlakelidze. Part of TDR Painter (Sparamix).
/* .tdrp project container: a standard ZIP archive (PKWARE APPNOTE) holding project.json.
 * Entries are deflated with the browser's built-in CompressionStream('deflate-raw'), or stored when that
 * would not be smaller. Every entry carries a CRC-32 of its uncompressed bytes, which read() verifies,
 * so a damaged or truncated file is refused instead of loading wrong values.
 * Deliberately small: no ZIP64, no encryption, no multi-disk, single-file archives of a few KiB.
 */
(function (root) {
  'use strict';

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  class TdrpError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const fail = (code, msg) => { throw new TdrpError(code, msg); };

  const SIG_LOCAL = 0x04034b50, SIG_CENTRAL = 0x02014b50, SIG_END = 0x06054b50;
  const FLAG_UTF8 = 0x0800;

  async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  }
  // Inflate with a hard output cap, so a hostile archive cannot exhaust memory.
  async function inflateRaw(bytes, maxBytes) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) { reader.cancel().catch(() => {}); fail('too_large', 'The project inside the file is unreasonably large.'); }
        chunks.push(value);
      }
    } catch (e) {
      if (e instanceof TdrpError) throw e;
      fail('damaged', 'The file is damaged: its compressed data could not be read.');
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  function dosDateTime(d) {
    const year = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  /** Build a ZIP from [{name, data: Uint8Array}]. Returns Uint8Array. */
  async function write(files, now) {
    const enc = new TextEncoder();
    const { time, date } = dosDateTime(now || new Date());
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      let method = 8, body = await pipe(data, new CompressionStream('deflate-raw'));
      if (body.length >= data.length) { method = 0; body = data; }
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, SIG_LOCAL, true); lh.setUint16(4, 20, true); lh.setUint16(6, FLAG_UTF8, true);
      lh.setUint16(8, method, true); lh.setUint16(10, time, true); lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, SIG_CENTRAL, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, FLAG_UTF8, true); ch.setUint16(10, method, true); ch.setUint16(12, time, true);
      ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true);
      ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);   // extra, comment, disk, attributes stay 0
      parts.push(new Uint8Array(lh.buffer), name, body);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + body.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, SIG_END, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of all) { out.set(p, o); o += p.length; }
    return out;
  }

  const isZip = (b) => b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

  /** Read the entry `name` from ZIP bytes, verifying size and CRC-32. Returns Uint8Array. */
  async function read(bytes, name, maxBytes) {
    maxBytes = maxBytes || 5e6;
    if (!isZip(bytes)) fail('not_zip', 'This is not a .tdrp project file.');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
      if (dv.getUint32(i, true) === SIG_END) { eocd = i; break; }
    }
    if (eocd < 0) fail('damaged', 'The file is damaged or incomplete: its directory is missing.');
    const count = dv.getUint16(eocd + 10, true);
    const cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
    if (cdOff + cdSize > eocd) fail('damaged', 'The file is damaged: its directory points outside the file.');
    const dec = new TextDecoder();
    let p = cdOff;
    for (let k = 0; k < count; k++) {
      if (p + 46 > eocd || dv.getUint32(p, true) !== SIG_CENTRAL) fail('damaged', 'The file is damaged: its directory is corrupt.');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
      const crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const entryName = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (entryName !== name) continue;
      if (flags & 1) fail('unsupported', 'Encrypted project files are not supported.');
      if (csize === 0xffffffff || usize === 0xffffffff || lho === 0xffffffff) fail('unsupported', 'ZIP64 project files are not supported.');
      if (method !== 0 && method !== 8) fail('unsupported', 'The project uses a compression method this page does not read.');
      if (usize > maxBytes) fail('too_large', 'The project inside the file is unreasonably large.');
      if (lho + 30 > bytes.length || dv.getUint32(lho, true) !== SIG_LOCAL) fail('damaged', 'The file is damaged: an entry header is corrupt.');
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      if (start + csize > bytes.length) fail('damaged', 'The file is damaged or incomplete: data is missing.');
      const body = bytes.subarray(start, start + csize);
      const data = method === 8 ? await inflateRaw(body, maxBytes) : body.slice();
      if (data.length !== usize || crc32(data) !== crc) fail('damaged', 'The file is damaged: its checksum does not match, so nothing was loaded.');
      return data;
    }
    fail('not_project', `The archive has no ${name}, so it is not a TDR Painter project.`);
  }

  const api = { crc32, write, read, isZip, TdrpError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TDRP = api;
})(typeof window !== 'undefined' ? window : globalThis);
