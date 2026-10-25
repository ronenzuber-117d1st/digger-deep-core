#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, '../..');
const HTML  = join(__dir, 'deep-core-title.html');
const OUT   = join(ROOT, 'public/assets/title');

mkdirSync(OUT, { recursive: true });

const html = readFileSync(HTML, 'utf8');

const re = /var A="(data:image\/png;base64,[^"]+)",B="(data:image\/png;base64,[^"]+)",M="(data:image\/png;base64,[^"]+)"/;
const m  = html.match(re);
if (!m) { console.error('Images not found in HTML'); process.exit(1); }

function save(dataUri, file) {
  const buf = Buffer.from(dataUri.replace(/^data:image\/png;base64,/, ''), 'base64');
  writeFileSync(file, buf);
  console.log(' ', file.replace(ROOT, '').replace(/\\/g, '/'));
}

save(m[1], join(OUT, 'title_a.png'));
save(m[2], join(OUT, 'title_b.png'));
save(m[3], join(OUT, 'title_menu.png'));
console.log('Done.');
