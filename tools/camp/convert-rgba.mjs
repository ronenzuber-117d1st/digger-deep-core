#!/usr/bin/env node
// Reads the (partially-corrupt) palette-indexed camp PNGs, reconstructs pixel
// data via raw-inflate, and re-encodes each frame as a valid RGBA PNG that
// Phaser WebGL can upload without errors.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync }               from 'node:zlib';
import { resolve, dirname, join }       from 'node:path';
import { fileURLToPath }                from 'node:url';
import { createRequire }                from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, '../..');
const CAMP  = join(ROOT, 'public/assets/camp');

const require = createRequire(import.meta.url);
const { PNG }  = require('pngjs');

function parsePng(buf) {
  let i = 8;
  let width = 0, height = 0;
  const palette = [];
  let idat = null;
  while (i < buf.length) {
    const len  = buf.readUInt32BE(i);
    const type = buf.slice(i + 4, i + 8).toString('ascii');
    if (type === 'IHDR') {
      width  = buf.readUInt32BE(i + 8);
      height = buf.readUInt32BE(i + 12);
    } else if (type === 'PLTE') {
      for (let c = 0; c < len / 3; c++)
        palette.push([buf[i + 8 + c*3], buf[i + 8 + c*3 + 1], buf[i + 8 + c*3 + 2]]);
    } else if (type === 'IDAT') {
      idat = buf.slice(i + 8, i + 8 + len);
    } else if (type === 'IEND') break;
    i += 4 + 4 + len + 4;
  }
  return { width, height, palette, idat };
}

function unfilterRows(raw, width, height) {
  const rowLen = 1 + width;
  const expected = height * rowLen;
  // pad with zeros if truncated
  const data = raw.length >= expected ? raw : Buffer.concat([raw, Buffer.alloc(expected - raw.length)]);
  const prev = Buffer.alloc(width, 0);
  const result = [];
  for (let row = 0; row < height; row++) {
    const base   = row * rowLen;
    const filter = data[base];
    const curr   = Buffer.from(data.slice(base + 1, base + 1 + width));
    const out    = Buffer.alloc(width);
    for (let x = 0; x < width; x++) {
      const c = curr[x];
      const a = x > 0 ? out[x - 1]  : 0;
      const b = prev[x];
      const d = x > 0 ? prev[x - 1] : 0;
      switch (filter) {
        case 0: out[x] = c; break;
        case 1: out[x] = (c + a) & 0xff; break;
        case 2: out[x] = (c + b) & 0xff; break;
        case 3: out[x] = (c + Math.floor((a + b) / 2)) & 0xff; break;
        case 4: {
          const pa = Math.abs(b - d), pb = Math.abs(a - d), pc = Math.abs(a + b - 2*d);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : d;
          out[x] = (c + pr) & 0xff; break;
        }
        default: out[x] = c;
      }
    }
    out.copy(prev);
    result.push(out);
  }
  return result;
}

for (let i = 0; i < 7; i++) {
  const file = join(CAMP, `camp_${i}.png`);
  const buf  = readFileSync(file);
  const { width, height, palette, idat } = parsePng(buf);

  // idat starts with 2-byte zlib header; last 4 bytes are adler32 (may be wrong)
  // use raw inflate to bypass checksum validation
  const deflateStream = idat.slice(2, idat.length - 4);
  let raw;
  try {
    raw = inflateRawSync(deflateStream);
  } catch (e) {
    // fallback: try without stripping trailer
    try { raw = inflateRawSync(idat.slice(2)); }
    catch { raw = Buffer.alloc(height * (1 + width), 0); }
  }

  const rows = unfilterRows(raw, width, height);

  const out  = new PNG({ width, height, colorType: 6 });
  for (let row = 0; row < height; row++) {
    for (let x = 0; x < width; x++) {
      const idx    = rows[row][x];
      const [r, g, b] = palette[idx] ?? [0, 0, 0];
      const offset = (row * width + x) * 4;
      out.data[offset]     = r;
      out.data[offset + 1] = g;
      out.data[offset + 2] = b;
      out.data[offset + 3] = 255;
    }
  }

  writeFileSync(file, PNG.sync.write(out));
  console.log(`camp_${i}.png  ${width}×${height}  raw=${raw.length}  → RGBA OK`);
}
console.log('Done.');
