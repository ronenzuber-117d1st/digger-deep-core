#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, '../..');
const HTML  = join(__dir, 'deep-core-camp.html');
const OUT   = join(ROOT, 'public/assets/camp');

mkdirSync(OUT, { recursive: true });

const html = readFileSync(HTML, 'utf8');

const m = html.match(/const F=\[([\s\S]*?)\]\.map/);
if (!m) { console.error('Frame array not found in HTML'); process.exit(1); }

const frames = [...m[1].matchAll(/"([A-Za-z0-9+/=]+)"/g)].map(x => x[1]);
if (frames.length === 0) { console.error('No frames found'); process.exit(1); }

frames.forEach((b64, i) => {
  const buf = Buffer.from(b64, 'base64');
  const file = join(OUT, `camp_${i}.png`);
  writeFileSync(file, buf);
  console.log(' ', file.replace(ROOT, '').replace(/\\/g, '/'));
});
console.log(`Done. ${frames.length} frames extracted.`);
