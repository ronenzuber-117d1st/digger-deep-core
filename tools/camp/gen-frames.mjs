#!/usr/bin/env node
// Reads camp_0 (original indexed PNG, truncated IDAT), decodes it via raw
// inflate, then synthesises 7 animation frames by cycling the fire/lamp
// palette entries through a warm-flicker sequence.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync }               from 'node:zlib';
import { resolve, dirname, join }       from 'node:path';
import { fileURLToPath }                from 'node:url';
import { createRequire }                from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, '../..');
const CAMP  = join(ROOT, 'public/assets/camp');
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

// ── PNG chunk parser ─────────────────────────────────────────────────────────
function parsePng(buf) {
  let i = 8, width = 0, height = 0;
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
      // use slice; may be shorter than len if file is truncated
      idat = buf.slice(i + 8, Math.min(i + 8 + len, buf.length));
    } else if (type === 'IEND') break;
    i += 4 + 4 + len + 4;
    if (i >= buf.length) break;
  }
  return { width, height, palette, idat };
}

// ── Row unfilter (PNG spec §6.6) ─────────────────────────────────────────────
function unfilterRows(raw, width, height) {
  const rowLen   = 1 + width;
  const expected = height * rowLen;
  const data = raw.length >= expected ? raw
    : Buffer.concat([raw, Buffer.alloc(expected - raw.length, 0)]);
  const result = [];
  const prev = Buffer.alloc(width, 0);
  for (let row = 0; row < height; row++) {
    const base   = row * rowLen;
    const filter = data[base];
    const out    = Buffer.alloc(width);
    for (let x = 0; x < width; x++) {
      const c = data[base + 1 + x];
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

// ── Decode camp_0 ────────────────────────────────────────────────────────────
const src  = parsePng(readFileSync(join(CAMP, 'camp_0.png')));
const { width, height, palette } = src;

let raw;
try {
  raw = inflateRawSync(src.idat.slice(2, src.idat.length - 4));
} catch {
  try { raw = inflateRawSync(src.idat.slice(2)); }
  catch { raw = Buffer.alloc(height * (1 + width), 0); }
}
const rows = unfilterRows(raw, width, height);

// ── Identify warm (fire) palette indices ─────────────────────────────────────
// Warm = R > 180 AND R > 2*B (clearly warm hue, not brown or skin)
const fireIndices = palette
  .map(([r, g, b], i) => ({ i, r, g, b }))
  .filter(({ r, g, b }) => r > 180 && r > b * 2 && g < 200);

console.log('Fire palette entries:', fireIndices.map(e =>
  `[${e.r},${e.g},${e.b}] idx=${e.i}`).join(', '));

// Sort fire entries from brightest (high r+g) to dimmest
fireIndices.sort((a, b) => (b.r + b.g) - (a.r + a.g));

// Build 7 per-frame palette remappings.
// Each frame is a copy of the base palette with fire indices cycled:
//   bright → normal → dim → normal → bright → normal → dim
const baseMap = palette.map((_, i) => i);  // identity

function shiftFire(cycleStep) {
  const map = [...baseMap];
  if (fireIndices.length >= 2) {
    // rotate fire indices by cycleStep positions
    const n = fireIndices.length;
    fireIndices.forEach(({ i: srcIdx }, pos) => {
      const dstEntry = fireIndices[(pos + cycleStep) % n];
      map[srcIdx] = dstEntry.i;
    });
  }
  return map;
}

// 7 cycle steps give a looping flicker: 0,1,2,1,0,2,1
const cycles = [0, 1, 2, 1, 0, 2, 1];

// ── Write frames ─────────────────────────────────────────────────────────────
for (let f = 0; f < 7; f++) {
  const palMap  = shiftFire(cycles[f]);
  const out     = new PNG({ width, height, colorType: 6 });
  out.data      = Buffer.alloc(width * height * 4);

  for (let row = 0; row < height; row++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = rows[row][x];
      const dstIdx = palMap[srcIdx];
      const [r, g, b] = palette[dstIdx] ?? [0, 0, 0];
      const offset = (row * width + x) * 4;
      out.data[offset]     = r;
      out.data[offset + 1] = g;
      out.data[offset + 2] = b;
      out.data[offset + 3] = 255;
    }
  }

  writeFileSync(join(CAMP, `camp_${f}.png`), PNG.sync.write(out));
  console.log(`camp_${f}.png written  (fire cycle step ${cycles[f]})`);
}
console.log('Done. Restore animation in base.ts: 7 frames at 125 ms.');
