#!/usr/bin/env node
/**
 * Deep Core art pipeline.
 * Extracts the pixel engine from docs/visual-direction.html, reads colours
 * from docs/palette.json, and exports sprite-sheet PNGs + a manifest JSON
 * to public/assets/sprites/.
 *
 * Usage:  npm run art
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dir     = dirname(__filename);
const ROOT      = resolve(__dir, '../..');
const OUT       = join(ROOT, 'public/assets/sprites');
const CONTACT   = join(ROOT, 'docs/art-reference/sprite-contact-sheet.png');

// ─── Palette ────────────────────────────────────────────────────────────────

const paletteData = JSON.parse(readFileSync(join(ROOT, 'docs/palette.json'), 'utf8'));
// Sort by index (1-based in JSON) → PAL[0..31] in engine order
const PAL = paletteData.colors
  .slice()
  .sort((a, b) => a.index - b.index)
  .map(c => c.hex);

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
const PAL_RGB = PAL.map(hexToRgb);

// ─── Pixel Engine (ported from docs/visual-direction.html) ──────────────────
// Everything is drawn into an indexed buffer of palette indices 0..31.
// Value 255 in a Buf is the transparent sentinel used during export.

class Buf {
  constructor(w, h, fill) {
    this.w = w; this.h = h;
    this.d = new Uint8Array(w * h).fill(fill != null ? fill : 0);
  }
  px(x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[y * this.w + x];
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x+i, y+j, c); }
  hline(x, y, w, c) { this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { this.rect(x, y, 1, h, c); }
  spr(s, x, y) {
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const v = s.p[j * s.w + i]; if (v >= 0) this.px(x+i, y+j, v);
    }
  }
  crop(x, y, w, h) {
    const o = new Buf(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.d[j*w+i] = this.get(x+i, y+j);
    return o;
  }
}

class Spr {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.p   = new Int16Array(w * h).fill(-1);
    this.id  = new Int16Array(w * h).fill(-1);
    this.det = new Uint8Array(w * h);
    this.ramps = [];
  }
  ramp(hi, mid, lo) { this.ramps.push([hi, mid, lo]); return this.ramps.length - 1; }
  set(x, y, id) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x; this.id[i] = id; this.det[i] = 0; this.p[i] = this.ramps[id][1];
  }
  ell(cx, cy, rx, ry, id) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const dx = (x+.5-cx)/rx, dy = (y+.5-cy)/ry; if (dx*dx+dy*dy <= 1) this.set(x, y, id);
    }
  }
  rect(x, y, w, h, id) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x+i, y+j, id); }
  poly(pts, id) {
    const n = pts.length;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const px = x+.5, py = y+.5; let ins = false;
      for (let i = 0, j = n-1; i < n; j = i++) {
        const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if (((yi>py) !== (yj>py)) && (px < (xj-xi)*(py-yi)/(yj-yi)+xi)) ins = !ins;
      }
      if (ins) this.set(x, y, id);
    }
  }
  dot(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x; this.p[i] = c; this.det[i] = 1; this.id[i] = -2;
  }
  drect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.dot(x+i, y+j, c); }
  clear(x, y) { const i = y*this.w+x; this.p[i] = -1; this.id[i] = -1; this.det[i] = 0; }
  ring(cx, cy, r, c) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const d = Math.hypot(x+.5-cx, y+.5-cy); if (Math.abs(d-r) < .55) this.dot(x, y, c);
    }
  }
  mirror() {
    const w = this.w, h = this.h;
    for (const k of ['p','id','det']) {
      const a = this[k], b = a.slice();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y*w+x] = b[y*w+(w-1-x)];
    }
    return this;
  }
  finish(out) {
    out = out || 0;
    const w = this.w, h = this.h, q = new Int16Array(w*h).fill(-1);
    const F = (x,y) => x>=0&&y>=0&&x<w&&y<h&&this.p[y*w+x]>=0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y*w+x; if (this.p[i] < 0) continue;
      if (this.det[i]) { q[i] = this.p[i]; continue; }
      const r = this.ramps[this.id[i]];
      const a = !F(x,y-1)||!F(x-1,y), b2 = !F(x,y+1)||!F(x+1,y);
      q[i] = (a&&!b2)?r[0]:((b2&&!a)?r[2]:r[1]);
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y*w+x;
      if (!F(x,y) && (F(x+1,y)||F(x-1,y)||F(x,y+1)||F(x,y-1))) q[i] = out;
    }
    return { w, h, p: q };
  }
}

// ─── Font data (Coalface 5×7) ────────────────────────────────────────────────
const GLY = [
  ['A','.###. #...# #...# ##### #...# #...# #...#'],['B','####. #...# #...# ####. #...# #...# ####.'],
  ['C','.###. #...# #.... #.... #.... #...# .###.'],['D','####. #...# #...# #...# #...# #...# ####.'],
  ['E','##### #.... #.... ####. #.... #.... #####'],['F','##### #.... #.... ####. #.... #.... #....'],
  ['G','.###. #...# #.... #.### #...# #...# .###.'],['H','#...# #...# #...# ##### #...# #...# #...#'],
  ['I','.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.'],['J','..### ...#. ...#. ...#. ...#. #..#. .##..'],
  ['K','#...# #..#. #.#.. ##... #.#.. #..#. #...#'],['L','#.... #.... #.... #.... #.... #.... #####'],
  ['M','#...# ##.## #.#.# #.#.# #...# #...# #...#'],['N','#...# ##..# #.#.# #..## #...# #...# #...#'],
  ['O','.###. #...# #...# #...# #...# #...# .###.'],['P','####. #...# #...# ####. #.... #.... #....'],
  ['Q','.###. #...# #...# #...# #.#.# #..#. .##.#'],['R','####. #...# #...# ####. #.#.. #..#. #...#'],
  ['S','.#### #.... #.... .###. ....# ....# ####.'],['T','##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..'],
  ['U','#...# #...# #...# #...# #...# #...# .###.'],['V','#...# #...# #...# #...# #...# .#.#. ..#..'],
  ['W','#...# #...# #...# #.#.# #.#.# ##.## #...#'],['X','#...# #...# .#.#. ..#.. .#.#. #...# #...#'],
  ['Y','#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..'],['Z','##### ....# ...#. ..#.. .#... #.... #####'],
  ['0','.###. #...# #..## #.#.# ##..# #...# .###.'],['1','..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.'],
  ['2','.###. #...# ....# ...#. ..#.. .#... #####'],['3','####. ....# ....# .###. ....# ....# ####.'],
  ['4','...#. ..##. .#.#. #..#. ##### ...#. ...#.'],['5','##### #.... ####. ....# ....# #...# .###.'],
  ['6','.###. #.... #.... ####. #...# #...# .###.'],['7','##### ....# ...#. ..#.. .#... .#... .#...'],
  ['8','.###. #...# #...# .###. #...# #...# .###.'],['9','.###. #...# #...# .#### ....# ....# .###.'],
  ['.','..... ..... ..... ..... ..... .##.. .##..'],[',' ,'..... ..... ..... ..... .##.. ..#.. .#...'],
  [':','..... .##.. .##.. ..... .##.. .##.. .....'],  ['-','..... ..... ..... ##### ..... ..... .....'],
  ['+','..... ..#.. ..#.. ##### ..#.. ..#.. .....'],  ['/',   '....# ....# ...#. ..#.. .#... #.... #....'],
  ['!','..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..'],  ['?','.###. #...# ....# ...#. ..#.. ..... ..#..'],
  ["'",'..#.. ..#.. .#... ..... ..... ..... .....'], ['%','##..# ##..# ...#. ..#.. .#... #..## #..##'],
  ['(','...#. ..#.. .#... .#... .#... ..#.. ...#.'],  [')' ,'.#... ..#.. ...#. ...#. ...#. ..#.. .#...'],
  ['#','.#.#. ##### .#.#. .#.#. ##### .#.#. .....'],  ['>','#.... .#... ..#.. ...#. ..#.. .#... #....'],
  ['<','....# ...#. ..#.. .#... ..#.. ...#. ....#'],   ['*','.#.#. ..#.. ##### ..#.. .#.#. ..... .....'],
  ['=','..... ##### ..... ##### ..... ..... .....'],   ['_','..... ..... ..... ..... ..... ..... #####'],
  ['[','.###. .#... .#... .#... .#... .#... .###.'],  [']','.###. ...#. ...#. ...#. ...#. ...#. .###.'],
  ['"','.#.#. .#.#. ..... ..... ..... ..... .....'],  ['$','.#### #.#.. .###. ..#.# ####. ..#.. .....'],
];
const FONT = {};
GLY.forEach(([c, r]) => {
  FONT[c] = r.split(' ').map(row => {
    let v = 0; for (let i = 0; i < 5; i++) v = (v<<1) | (row[i]==='#'?1:0); return v;
  });
});

// ─── Misc helpers ────────────────────────────────────────────────────────────
function rng(seed) {
  let s = (seed * 2654435761 >>> 0) || 1;
  return () => { s ^= s<<13; s >>>=0; s ^= s>>>17; s ^= s<<5; s >>>=0; return s/4294967296; };
}

const CHAINS = [
  [0,4,5,6,7,8,9],[0,1,2,3],[0,10,11,12,13,14],[0,15,16,17,18,19],
  [0,20,21,22,23,24],[0,3,27,26,25,30],[0,2,28,29],[0,20,21,31]
];
function darken(c, n) {
  if (c===0||n<=0) return c;
  for (const ch of CHAINS) { const p = ch.indexOf(c); if (p > 0) return ch[Math.max(0,p-n)]; }
  return c;
}

// ─── Memoisation ─────────────────────────────────────────────────────────────
const cache = {};
const memo  = (k, f) => cache[k] || (cache[k] = f());

// ─── Sprite functions (faithful to visual-direction.html) ────────────────────

function rigSide(f) {
  const s = new Spr(16,16);
  const T=s.ramp(27,3,2), A=s.ramp(24,23,22), S=s.ramp(26,27,3), E=s.ramp(30,25,26), K=s.ramp(1,0,0);
  const o = f;
  s.ell(4,12.8,2.7,2.7,T); s.ell(10,12.8,2.7,2.7,T);
  s.rect(1,8+o,11,4,A); s.rect(11,8+o,1,4,A);
  s.drect(2,10+o,4,1,22); s.dot(11,9+o,24);
  if (!f) {
    s.poly([[11,8.2],[15,5.4],[15,10.8]],K);
    s.poly([[10.6,7.6],[15,3.4],[15,5.8],[11.2,8.6]],S); s.poly([[10.6,9.4],[15,12.4],[15,10.2],[11.2,8.8]],S);
    s.dot(14,6,25); s.dot(12,7,25); s.dot(14,10,25); s.dot(12,9,25);
  } else {
    s.poly([[10.6,8.4],[15,7.8],[15,9.8],[11.2,10.2]],S); s.poly([[10.6,10.4],[15,9.8],[15,11.6],[11.2,12]],S);
    s.dot(14,9,25); s.dot(12,9,25); s.dot(13,10,25); s.dot(15,8,24); s.dot(15,6,25); s.dot(14,5,24);
  }
  const ey = f?4.5:5.5; s.ell(3.8,ey,2.3,2.3,E); s.ell(9.2,ey-0.3,2.3,2.3,E);
  s.drect(4,Math.round(ey-0.5),1,2,0); s.drect(10,Math.round(ey-0.8),1,2,0);
  s.dot(f?4:3,f?13:12,26); s.dot(f?10:9,f?13:12,26);
  s.dot(0,f?7:9,26); if (f) s.dot(0,9,26); else s.dot(0,7,26);
  return s;
}
function rigDown(f) {
  const s = new Spr(16,16);
  const T=s.ramp(27,3,2), A=s.ramp(24,23,22), S=s.ramp(26,27,3), E=s.ramp(30,25,26);
  s.rect(0,6,3,9,T); s.rect(13,6,3,9,T); for (let y=7+f;y<14;y+=2){s.dot(1,y,1);s.dot(14,y,1);}
  s.rect(2,5,12,10,A);
  const ey=f?3.4:4.3; s.ell(5.3,ey,2.6,2.6,E); s.ell(10.7,ey,2.6,2.6,E);
  s.drect(5,f?4:5,2,2,0); s.drect(10,f?4:5,2,2,0);
  s.rect(3,9,10,5,S);
  if (!f){s.drect(4,10,8,3,0);[4,6,8,10].forEach(x=>s.dot(x,10,25));[5,7,9,11].forEach(x=>s.dot(x,12,25));}
  else{s.drect(4,11,8,1,0);[4,6,8,10].forEach(x=>s.dot(x,10,25));[5,7,9,11].forEach(x=>s.dot(x,12,25));s.dot(2,15,26);s.dot(13,15,26);}
  s.dot(7,7,24); s.dot(8,7,24);
  return s;
}
function rigUp(f) {
  const s = new Spr(16,16);
  const T=s.ramp(27,3,2), A=s.ramp(24,23,22), S=s.ramp(26,27,3), E=s.ramp(30,25,26);
  s.rect(0,8,3,8,T); s.rect(13,8,3,8,T); for(let y=9+f;y<15;y+=2){s.dot(1,y,1);s.dot(14,y,1);}
  s.rect(2,9,12,6,A); s.drect(5,13,6,1,22);
  const ey=f?8.4:9.2; s.ell(5.3,ey,2.5,2.5,E); s.ell(10.7,ey,2.5,2.5,E);
  s.drect(5,f?7:8,2,2,0); s.drect(10,f?7:8,2,2,0);
  if (!f){s.poly([[3.4,7],[0.8,1.6],[3.6,2],[5.6,6.4]],S);s.poly([[12.6,7],[15.2,1.6],[12.4,2],[10.4,6.4]],S);s.dot(2,3,25);s.dot(13,3,25);s.dot(3,5,25);s.dot(12,5,25);}
  else{s.poly([[3.4,7],[6.6,1.6],[7.6,2.6],[5.6,6.6]],S);s.poly([[12.6,7],[9.4,1.6],[8.4,2.6],[10.4,6.6]],S);s.dot(7,4,25);s.dot(8,4,25);s.dot(7,0,24);s.dot(8,0,24);}
  s.dot(f?4:5,15,26);
  return s;
}
function rig(dir, frame) {
  return memo('rig'+dir+frame, () => {
    let s;
    if (dir==='right'||dir==='left'){s=rigSide(frame);if(dir==='left')s.mirror();}
    else s = dir==='down'?rigDown(frame):rigUp(frame);
    return s.finish(0);
  });
}

function bag(squash) {
  return memo('bag'+squash, () => {
    const s=new Spr(16,16); const G_=s.ramp(25,24,23);
    const dollar=(y0)=>{s.drect(7,y0,3,1,21);s.dot(7,y0+1,21);s.dot(8,y0+2,21);s.dot(9,y0+3,21);s.drect(7,y0+4,3,1,21);s.dot(8,y0-1,21);s.dot(8,y0+5,21);};
    if(!squash){s.ell(8,10,6.3,5.3,G_);s.poly([[5,3.5],[11,3.5],[10.4,6],[5.6,6]],G_);s.drect(5,6,6,1,22);s.drect(7,3,2,1,22);dollar(9);}
    else{s.ell(8,11.5,7.2,4,G_);s.poly([[6,5.8],[10,5.8],[9.6,7.6],[6.4,7.6]],G_);s.drect(6,7,4,1,22);dollar(9);}
    return s.finish(0);
  });
}

function nugget() {
  return memo('nug', () => {
    const s=new Spr(8,8); const G_=s.ramp(25,24,23);
    s.ell(4,4.2,3.2,2.7,G_); s.dot(3,3,25); return s.finish(0);
  });
}

function emerald(small) {
  return memo('em'+small, () => {
    if (small){
      const s=new Spr(11,11); const G_=s.ramp(14,13,12), L=s.ramp(12,11,11);
      s.poly([[5.5,1],[9.5,3.4],[9.5,7.6],[5.5,10],[1.5,7.6],[1.5,3.4]],G_);
      s.poly([[5.5,5.5],[9.5,3.4],[9.5,7.6],[5.5,10]],L); s.dot(3,3,30); s.dot(4,2,30); return s.finish(0);
    }
    const s=new Spr(16,16); const G_=s.ramp(14,13,12), L=s.ramp(12,11,11);
    s.poly([[8,2],[13,5],[13,11],[8,14.5],[3,11],[3,5]],G_);
    s.poly([[8,8],[13,5],[13,11],[8,14.5]],L);
    [[4,5],[5,6],[6,7],[7,8],[8,8],[9,8],[10,7],[11,6],[12,5]].forEach(p=>s.dot(p[0],p[1],12));
    s.dot(6,4,30); s.dot(5,5,30); s.dot(7,3,14);
    return s.finish(0);
  });
}

function fuelCan(small) {
  return memo('fuel'+small, () => {
    if (small){
      const s=new Spr(11,11); const B=s.ramp(19,18,17), K=s.ramp(26,27,3);
      s.rect(2,4,7,6,B); s.rect(6,1,3,3,K); s.drect(3,6,5,2,25); s.dot(5,7,17); return s.finish(0);
    }
    const s=new Spr(16,16); const B=s.ramp(19,18,17), K=s.ramp(26,27,3);
    s.rect(3,5,10,9,B); s.rect(4,2,5,3,K); s.clear(5,3); s.clear(6,3); s.clear(7,3);
    s.rect(10,2,3,3,K); s.drect(5,8,6,4,25); s.drect(6,9,4,1,17); s.drect(7,10,2,1,17); s.drect(3,6,10,1,16);
    return s.finish(0);
  });
}

function nest(frame) {
  return memo('nest'+frame, () => {
    const s=new Spr(16,16); const N=s.ramp(8,7,6), E=s.ramp(25,25,26); const o=frame?1:0;
    s.ell(8,12.2,7.2,3.6,N); s.ell(5,9.5-o,2.2,2.8,E); s.ell(9,8.6-(1-o),2.4,3.1,E); s.ell(12.2,10-o,1.9,2.4,E);
    s.dot(5,9-o,31); s.dot(9,8-(1-o),31); s.dot(10,9-(1-o),31); s.dot(12,10-o,31);
    [[2,11],[13,13],[6,14],[10,13]].forEach(p=>s.dot(p[0],p[1],5));
    const g=frame?[[2,3],[9,2],[14,4]]:[[4,2],[8,1],[13,3]]; g.forEach(p=>s.dot(p[0],p[1],29));
    return s.finish(0);
  });
}

function exitShaft(frame) {
  return memo('exit'+frame, () => {
    const s=new Spr(16,16); const S=s.ramp(26,27,3);
    s.rect(1,1,14,14,S); s.drect(3,3,1,11,0); s.drect(12,3,1,11,0); s.drect(4,2,8,1,0);
    s.drect(4,3,8,3,25); s.drect(4,6,8,4,24); s.drect(4,10,8,4,23);
    s.dot(4,3,27); s.dot(11,3,27); s.drect(5,3,1,11,7); s.drect(10,3,1,11,7);
    for (let y=4+frame;y<14;y+=3) s.drect(5,y,6,1,8);
    return s.finish(0);
  });
}

function grub(frame, dir) {
  return memo('grub'+frame+dir, () => {
    const s=new Spr(16,16); const G_=s.ramp(31,22,21); const h=frame?1:0;
    s.ell(3.4+h,11.2,2.9,2.7,G_); s.ell(6.5,10.2-h,3.2,3.1,G_); s.ell(9.5,9.2-h,3.4,3.4,G_); s.ell(12,8.4,3,3.3,G_);
    [[5,9,12],[8,7-h,11],[10,6,10]].forEach(([x,a,b])=>{ for(let y=a;y<=b;y++) if(s.p[y*16+x]>=0) s.dot(x,y,20); });
    s.drect(11,6,3,2,25); s.dot(13,7,0); s.dot(11,5,0); s.dot(12,5,0); s.dot(14,10,25); s.dot(14,11,25);
    if (dir<0) s.mirror(); return s.finish(0);
  });
}

function grubSquash() {
  return memo('grubsq', () => {
    const s=new Spr(16,16); const G_=s.ramp(31,22,21);
    s.ell(8,12.8,7.2,2.6,G_); s.dot(10,11,0); s.dot(12,11,0); s.dot(11,12,0); s.dot(10,13,0); s.dot(12,13,0);
    s.dot(5,12,20); s.dot(7,13,20); return s.finish(0);
  });
}

function burrower(frame) {
  return memo('burr'+frame, () => {
    const s=new Spr(16,16); const P=s.ramp(29,28,2), K=s.ramp(25,26,27); const e=frame?0.9:0;
    s.poly([[4.5,6],[1.6-e,8.5],[1.6-e,12.5],[3.2,14.2],[5.2,11.5]],K);
    s.poly([[11.5,6],[14.4+e,8.5],[14.4+e,12.5],[12.8,14.2],[10.8,11.5]],K);
    s.ell(8,6.8,3.8,4.6,P); s.poly([[6.3,10],[9.7,10],[8,14.5]],P);
    s.poly([[5,3.4],[5.8,0.9],[7.2,3]],P); s.poly([[8.8,3],[10.2,0.9],[11,3.4]],P);
    s.drect(6,5,2,2,25); s.drect(9,5,2,2,25); s.dot(7,6,0); s.dot(10,6,0); s.dot(8,13,31);
    return s.finish(0);
  });
}

function spitter(frame, dir) {
  return memo('spit'+frame+dir, () => {
    const s=new Spr(16,16); const G_=s.ramp(12,11,10), B=s.ramp(26,27,3), O=s.ramp(24,23,22); const rc=frame?1:0;
    s.ell(6.5,10.5,5.2,4.2,G_); s.ell(7,6.8,3.8,3.6,G_);
    s.poly([[4.5,4],[5.6,1],[6.7,3.5]],O); s.poly([[6.9,3.2],[8,0.6],[9.1,3]],O);
    s.rect(10-rc,5,5,4,B); s.drect(14-rc,6,1,2,23);
    if (frame){s.dot(15,6,24);s.dot(15,7,25);}
    s.drect(6,5,3,2,25); s.dot(8,6,0); s.drect(5,4,4,1,0); s.drect(4,12,5,1,10);
    if (dir<0) s.mirror(); return s.finish(0);
  });
}

function drifter(frame) {
  return memo('drift'+frame, () => {
    const s=new Spr(16,16); const G_=s.ramp(25,26,27); const b=frame?1:0;
    s.ell(8,6.3+b,5.2,4.6,G_); s.rect(3,7+b,10,4,G_);
    for (let i=0;i<4;i++) s.rect(3+i*3,11+b,2,((i+frame)%2)?3:2,G_);
    const f=s.finish(0);
    for (let y=0;y<16;y++) for (let x=0;x<16;x++){
      const dx=(x+.5-8)/3.9, dy=(y+.5-(8+b))/3.1;
      if (dx*dx+dy*dy<=1&&((x+y)&1)) f.p[y*16+x]=-1;
    }
    [[5,6],[5,7],[5,8],[10,6],[10,7],[10,8]].forEach(p=>{f.p[(p[1]+b)*16+p[0]]=0;});
    return f;
  });
}

function spitBolt() {
  return memo('bolt', () => {
    const s=new Spr(8,8); const R=s.ramp(30,31,22);
    s.poly([[4,0.5],[7.5,4],[4,7.5],[0.5,4]],R); s.dot(3,3,30); return s.finish(0);
  });
}

function heart(full) {
  return memo('heart'+full, () => {
    const s=new Spr(11,10); const R=full?s.ramp(31,22,21):s.ramp(3,2,2);
    s.ell(3.4,3.4,2.9,2.7,R); s.ell(7.6,3.4,2.9,2.7,R);
    s.poly([[0.7,4],[10.3,4],[5.5,9.3]],R); if (full) s.dot(2,2,30); return s.finish(0);
  });
}

function icon(name) {
  return memo('ic'+name, () => {
    const s=new Spr(16,16);
    const ST=s.ramp(26,27,3), AM=s.ramp(24,23,22), GD=s.ramp(25,24,23), WD=s.ramp(8,7,6), PU=s.ramp(29,28,2), CR=s.ramp(25,26,27);
    switch(name){
      case 'hull':
        s.poly([[8,1.5],[14,3.5],[13.5,9],[8,14.5],[2.5,9],[2,3.5]],ST);
        s.drect(7,4,2,8,23); s.drect(5,7,6,2,23); s.dot(4,4,30); s.dot(5,3,30); break;
      case 'fuel': return fuelCan(false);
      case 'drill':
        s.ell(8,8,5,5,ST); s.rect(6,1,4,2,ST); s.rect(6,13,4,2,ST); s.rect(1,6,2,4,ST); s.rect(13,6,2,4,ST);
        s.rect(3,3,2,2,ST); s.rect(11,3,2,2,ST); s.rect(3,11,2,2,ST); s.rect(11,11,2,2,ST);
        s.drect(6,6,4,4,1); s.drect(7,7,2,2,23); s.dot(7,7,24); break;
      case 'pulse':
        s.ell(8,8,5.2,5.2,PU); s.ell(8,8,2.2,2.2,CR); s.dot(7,7,30);
        [[8,0],[8,15],[0,8],[15,8],[2,2],[13,2],[2,13],[13,13]].forEach(p=>s.dot(p[0],p[1],29)); break;
      case 'prospector':
        s.poly([[7,3],[11,5.4],[11,9.6],[7,12.6],[3,9.6],[3,5.4]],s.ramp(14,13,12));
        s.poly([[7,7.5],[11,5.4],[11,9.6],[7,12.6]],s.ramp(12,11,11)); s.dot(5,5,30);
        [[13,1],[13,2],[13,3],[12,2],[14,2]].forEach(p=>s.dot(p[0],p[1],25));
        s.dot(2,13,25);s.dot(1,13,25);s.dot(3,13,25);s.dot(2,12,25);s.dot(2,14,25); break;
      case 'salvage':
        s.rect(2,2,9,12,CR); s.drect(4,4,5,1,27); s.drect(4,6,5,1,27); s.drect(4,8,3,1,27);
        s.ell(11.5,11,3.4,3.4,GD); s.dot(11,10,21); s.dot(11,11,21); s.dot(11,12,21); break;
      case 'pick':
        s.poly([[7,6],[9,6],[5.4,14],[3.4,14]],WD);
        s.poly([[2.5,6.5],[8,1.8],[14,5],[14,7.2],[8,4.4],[3.8,8.4]],ST); break;
      case 'lantern':
        s.rect(5,4,6,8,GD); s.rect(4,3,8,2,ST); s.rect(4,12,8,2,ST); s.drect(7,6,2,4,22);
        s.dot(7,1,27); s.dot(8,1,27); s.dot(6,2,27); s.dot(9,2,27);
        s.dot(1,8,24); s.dot(14,8,24); s.dot(2,5,24); s.dot(13,5,24); break;
      case 'magnet':
        s.ell(8,8.5,6,6,ST); s.ell(8,8.5,3,3,ST);
        for(let y=0;y<16;y++) for(let x=0;x<16;x++){const dx=(x+.5-8)/3,dy=(y+.5-8.5)/3;if(dx*dx+dy*dy<=1)s.clear(x,y);}
        for(let y=0;y<9;y++) for(let x=5;x<11;x++) s.clear(x,y);
        s.drect(2,1,3,3,22); s.drect(11,1,3,3,18); break;
      case 'ping':
        s.ring(8,8,3,18); s.ring(8,8,5.6,19); s.ring(8,8,7.4,17); s.drect(7,7,2,2,25); break;
      default: break;
    }
    return s.finish(0);
  });
}

function tessa() {
  return memo('tessa', () => {
    const s=new Spr(16,24);
    const SK=s.ramp(9,8,7), HT=s.ramp(25,24,23), OV=s.ramp(17,16,15), BT=s.ramp(6,5,4), ST=s.ramp(26,27,3);
    s.rect(3,12,10,8,OV); s.rect(4,20,3,3,BT); s.rect(9,20,3,3,BT); s.rect(2,13,2,5,OV); s.rect(12,13,2,5,OV);
    s.rect(2,18,2,2,SK); s.rect(12,18,2,2,SK); s.ell(8,8.6,4.3,3.7,SK);
    s.ell(8,5.4,5,3.2,HT); s.rect(2,6,12,2,HT); s.dot(7,3,30); s.dot(8,3,30);
    s.drect(4,6,3,2,18); s.drect(9,6,3,2,18); s.dot(4,6,19); s.dot(9,6,19);
    s.dot(6,9,0); s.dot(10,9,0); s.drect(5,8,2,1,0); s.drect(9,8,2,1,0); s.drect(7,11,3,1,0);
    s.rect(14,15,2,8,ST);
    return s.finish(0);
  });
}

function orin() {
  return memo('orin', () => {
    const s=new Spr(16,24);
    const SK=s.ramp(25,9,8), HR=s.ramp(29,28,2), CT=s.ramp(13,12,11), CR=s.ramp(25,26,27), BT=s.ramp(6,5,4);
    s.rect(4,14,8,8,CT); s.rect(5,22,2,2,BT); s.rect(9,22,2,2,BT); s.rect(3,15,2,5,CT); s.rect(11,15,2,5,CT);
    s.rect(3,20,2,2,SK); s.rect(11,20,2,2,SK); s.rect(12,14,3,8,CR);
    s.ell(8,9,4.2,4.2,SK); s.ell(8,5.6,4.8,3.2,HR); s.dot(3,4,29); s.dot(12,3,29);
    s.drect(3,7,5,5,0); s.drect(9,7,5,5,0); s.drect(4,8,3,3,25); s.drect(10,8,3,3,25);
    s.dot(6,9,0); s.dot(11,9,0); s.dot(8,9,0);
    s.drect(7,12,2,1,21);
    s.dot(14,5,19); s.dot(14,6,18); s.dot(14,7,18);
    return s.finish(0);
  });
}

function radio(frame) {
  return memo('radio'+frame, () => {
    const s=new Spr(16,16); const R=s.ramp(26,27,3);
    s.rect(2,6,12,9,R); s.drect(4,8,4,3,29); s.dot(5,9,25);
    s.drect(9,8,4,1,0); s.drect(9,10,4,1,0); s.drect(9,12,4,1,0);
    s.dot(4,12,22); s.dot(6,12,24);
    s.dot(11,4,27); s.dot(12,3,27); s.dot(12,2,27); s.dot(13,1,27); s.dot(13,0,29);
    if (frame){s.dot(0,7,29);s.dot(0,9,29);s.dot(15,7,29);s.dot(15,9,29);}
    else{s.dot(1,5,29);s.dot(1,11,29);s.dot(14,5,29);}
    return s.finish(0);
  });
}

function portrait(who) {
  return memo('pt'+who, () => {
    const s=new Spr(24,24);
    if (who==='tessa'){
      const SK=s.ramp(9,8,7), HT=s.ramp(25,24,23), OV=s.ramp(17,16,15);
      s.rect(5,19,14,5,OV); s.ell(12,14,6.6,6.2,SK); s.ell(12,7.5,8.5,5,HT);
      s.rect(3,9,18,2,HT); s.drect(11,3,2,2,30);
      s.drect(6,9,5,3,18); s.drect(13,9,5,3,18); s.dot(6,9,19); s.dot(13,9,19);
      s.drect(6,12,5,1,0); s.drect(13,12,5,1,0);
      s.drect(7,14,2,2,0); s.drect(15,14,2,2,0); s.drect(6,13,3,1,0); s.drect(15,13,3,1,0);
      s.drect(9,19,6,1,0); s.dot(8,18,0); s.dot(15,18,0);
    } else if (who==='orin'){
      const SK=s.ramp(25,9,8), HR=s.ramp(29,28,2), CT=s.ramp(13,12,11);
      s.rect(6,20,12,4,CT); s.ell(12,13,6.4,7,SK); s.ell(12,8,7.4,4.6,HR);
      s.dot(4,7,29); s.dot(19,6,29);
      s.drect(5,11,6,6,0); s.drect(13,11,6,6,0); s.drect(6,12,4,4,25); s.drect(14,12,4,4,25);
      s.drect(8,13,2,2,0); s.drect(14,13,2,2,0); s.drect(11,13,2,1,0);
      s.drect(10,19,4,1,21); s.dot(21,8,19); s.dot(21,9,18); s.dot(21,10,18); s.dot(20,10,18);
    } else {
      const R=s.ramp(26,27,3);
      s.rect(2,7,20,15,R); s.dot(18,5,27); s.dot(19,4,27); s.dot(20,3,27); s.dot(21,2,27); s.dot(21,1,29);
      for(let y=10;y<19;y+=2) s.drect(4,y,6,1,0);
      s.drect(12,10,8,9,1);
      [[13,3],[15,6],[17,4],[19,7]].forEach((b,i)=>{s.drect(b[0],18-b[1],2,b[1],i%2?29:28);});
      s.dot(0,10,29); s.dot(0,13,29); s.dot(23,10,29); s.dot(23,13,29);
    }
    return s.finish(0);
  });
}

// ─── Tiles ───────────────────────────────────────────────────────────────────
const THEMES = {
  A: { dirt:{ mid:6, hi:7, lo:5, peb:8, pebLo:4, lit:9, rim:4, shade:5 }, floor:1, fspeck:2, shadow:0 },
};
const NOM = { n:0, e:0, s:0, w:0, nw:0, ne:0, sw:0, se:0 };

function drawDirt(b, ox, oy, T, seed, m) {
  m = m || NOM; const r = rng(seed+11); const D = T.dirt;
  const t = new Uint8Array(256).fill(D.mid);
  for (let k=0;k<256;k++){const v=r();if(v<0.07)t[k]=D.hi;else if(v<0.12)t[k]=D.lo;}
  for (let n=0;n<4;n++){const x=Math.floor(r()*12),y=Math.floor(r()*16),c=r()<0.5?D.hi:D.lo;for(let i=0;i<3;i++)t[y*16+x+i]=c;}
  if(r()<0.5){const x=3+Math.floor(r()*9),y=3+Math.floor(r()*9);t[y*16+x]=D.peb;t[y*16+x+1]=D.peb;t[(y+1)*16+x]=D.pebLo;t[(y+1)*16+x+1]=D.pebLo;}
  for (let y=0;y<16;y++) for (let x=0;x<16;x++){
    let c=t[y*16+x], best=99, side='';
    if(m.n&&y<best){best=y;side='n';}if(m.w&&x<best){best=x;side='w';}if(m.s&&15-y<best){best=15-y;side='s';}if(m.e&&15-x<best){best=15-x;side='e';}
    if(best===0)c=D.rim;else if(best===1)c=(side==='n'||side==='w')?D.lit:D.shade;
    if(m.n&&m.w&&x+y<2)c=T.floor;if(m.n&&m.e&&(15-x)+y<2)c=T.floor;if(m.s&&m.w&&x+(15-y)<2)c=T.floor;if(m.s&&m.e&&(15-x)+(15-y)<2)c=T.floor;
    if(m.nw&&!m.n&&!m.w){if(x===0&&y===0)c=T.floor;else if(x+y===1)c=D.rim;}
    if(m.ne&&!m.n&&!m.e){if(x===15&&y===0)c=T.floor;else if((15-x)+y===1)c=D.rim;}
    if(m.sw&&!m.s&&!m.w){if(x===0&&y===15)c=T.floor;else if(x+(15-y)===1)c=D.rim;}
    if(m.se&&!m.s&&!m.e){if(x===15&&y===15)c=T.floor;else if((15-x)+(15-y)===1)c=D.rim;}
    b.px(ox+x, oy+y, c);
  }
}

function drawFloor(b, ox, oy, T, seed, sn, sw) {
  const r=rng(seed+77);
  for(let y=0;y<16;y++) for(let x=0;x<16;x++){
    let c=T.floor; const v=r(); if(v<0.04)c=T.fspeck;
    if(sn&&y<2)c=T.shadow; if(sw&&x<1)c=T.shadow;
    b.px(ox+x,oy+y,c);
  }
}

function drawBedrock(b, ox, oy, seed) {
  const r=rng(seed+5);
  const stone=(x0,y0,w,h)=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++){let c=2;if(y===0||x===0)c=3;else if(y===h-1||x===w-1)c=1;else if(r()<0.07)c=3;else if(r()<0.05)c=1;b.px(ox+x0+x,oy+y0+y,c);}};
  b.rect(ox,oy,16,16,0);
  const o=Math.floor(r()*3)+2;
  stone(0,0,o+3,7); stone(o+4,0,16-o-4,7); stone(0,8,16-o-4,7); stone(16-o-3,8,o+3,7);
  if(r()<0.5){const x=3+Math.floor(r()*8);b.px(ox+x,oy+3,0);b.px(ox+x+1,oy+4,0);}
}

// ─── HUD helpers ─────────────────────────────────────────────────────────────

function makePip(filled) {
  const b = new Buf(5, 5, 255);
  b.rect(0, 0, 5, 5, 0);
  if (filled) { b.rect(1,1,3,3,24); b.px(1,1,25); }
  else b.rect(1,1,3,3,2);
  return { w:5, h:5, p: Int16Array.from(b.d.map(v => v===255 ? -1 : v)) };
}

function makeFuelSegment(low) {
  const b = new Buf(3, 6, 255);
  const [hi,md,lo] = low ? [22,21,21] : [19,18,17];
  b.rect(0,0,3,1,hi); b.rect(0,1,3,3,md); b.rect(0,4,3,1,lo);
  return { w:3, h:6, p: Int16Array.from(b.d.map(v => v===255 ? -1 : v)) };
}

// ─── PNG export ───────────────────────────────────────────────────────────────

function writePNG(buf, filePath, transparent = true) {
  const png = new PNG({ width: buf.w, height: buf.h, filterType: -1 });
  for (let i = 0; i < buf.d.length; i++) {
    const ci = buf.d[i];
    const pi = i * 4;
    if (transparent && ci === 255) {
      png.data[pi] = png.data[pi+1] = png.data[pi+2] = png.data[pi+3] = 0;
    } else {
      const safe = (ci >= 32) ? 0 : ci;
      const [r,g,bv] = PAL_RGB[safe];
      png.data[pi]=r; png.data[pi+1]=g; png.data[pi+2]=bv; png.data[pi+3]=255;
    }
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, PNG.sync.write(png));
  console.log(`  ${filePath.replace(ROOT, '').replace(/\\/g,'/')}`);
}

// ─── Sprite sheet builder ─────────────────────────────────────────────────────
// sprites: array of finished sprites {w,h,p} from Spr.finish()
// All packed into a 1-row strip, each cell cellW×cellH, sprite centred.

function makeStrip(sprites, cellW, cellH) {
  const buf = new Buf(sprites.length * cellW, cellH, 255);
  sprites.forEach((s, i) => {
    const ox = i * cellW + Math.floor((cellW - s.w) / 2);
    const oy = Math.floor((cellH - s.h) / 2);
    buf.spr(s, ox, oy);
  });
  return buf;
}

// Place raw Buf tile (already drawn) into a larger sheet at grid pos (col,row)
function placeTile(sheet, tile, col, row, cellW, cellH) {
  for (let y = 0; y < tile.h; y++)
    for (let x = 0; x < tile.w; x++)
      sheet.px(col*cellW + x, row*cellH + y, tile.get(x,y));
}

// ─── Main export ─────────────────────────────────────────────────────────────

function run() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(dirname(CONTACT), { recursive: true });

  const manifest = { sheets: [] };

  // ── Player ──────────────────────────────────────────────────────────────────
  {
    const frames = [
      rig('up',0), rig('up',1),
      rig('right',0), rig('right',1),
      rig('down',0), rig('down',1),
      rig('left',0), rig('left',1),
    ];
    const names = ['up_0','up_1','right_0','right_1','down_0','down_1','left_0','left_1'];
    writePNG(makeStrip(frames, 16, 16), join(OUT,'player.png'));
    manifest.sheets.push({
      name:'player', file:'player.png', frameWidth:16, frameHeight:16,
      cols:8, rows:1,
      frames: names.map((name,i)=>({ name, col:i, row:0 })),
    });
  }

  // ── Monsters ─────────────────────────────────────────────────────────────────
  {
    const frames = [
      grub(0,1), grub(1,1),
      burrower(0), burrower(1),
      spitter(0,1), spitter(1,1),
      drifter(0), drifter(1),
      grubSquash(), spitBolt(),
    ];
    const names = ['grub_0','grub_1','burrower_0','burrower_1','spitter_0','spitter_1','drifter_0','drifter_1','grub_squash','spit_bolt'];
    writePNG(makeStrip(frames, 16, 16), join(OUT,'monsters.png'));
    manifest.sheets.push({
      name:'monsters', file:'monsters.png', frameWidth:16, frameHeight:16,
      cols:10, rows:1,
      frames: names.map((name,i)=>({ name, col:i, row:0 })),
    });
  }

  // ── Objects ───────────────────────────────────────────────────────────────────
  {
    const frames = [
      bag(false), bag(true), nugget(), emerald(false),
      fuelCan(false), nest(0), nest(1), exitShaft(0), exitShaft(1),
    ];
    const names = ['bag','bag_landed','nugget','emerald','fuel_canister','nest_0','nest_1','exit_shaft_0','exit_shaft_1'];
    writePNG(makeStrip(frames, 16, 16), join(OUT,'objects.png'));
    manifest.sheets.push({
      name:'objects', file:'objects.png', frameWidth:16, frameHeight:16,
      cols:9, rows:1,
      frames: names.map((name,i)=>({ name, col:i, row:0 })),
    });
  }

  // ── Icons ─────────────────────────────────────────────────────────────────────
  // 8 permanent upgrades + magnet_coil + echo_ping + spare_fuel (reuses fuel icon)
  {
    const iconKeys  = ['hull','fuel','drill','pulse','prospector','salvage','pick','lantern','magnet','ping','fuel'];
    const iconNames = ['hull','fuel_tank','drill_motor','pulse_core','prospector','salvage_contract','extra_pick','lantern_mount','magnet_coil','echo_ping','spare_fuel'];
    const frames = iconKeys.map(k => icon(k));
    writePNG(makeStrip(frames, 16, 16), join(OUT,'icons.png'));
    manifest.sheets.push({
      name:'icons', file:'icons.png', frameWidth:16, frameHeight:16,
      cols:11, rows:1,
      frames: iconNames.map((name,i)=>({ name, col:i, row:0 })),
    });
  }

  // ── Crew ──────────────────────────────────────────────────────────────────────
  {
    const frames = [tessa(), orin(), radio(0), radio(1)];
    const names  = ['tessa','orin','radio_0','radio_1'];
    writePNG(makeStrip(frames, 28, 28), join(OUT,'crew.png'));
    manifest.sheets.push({
      name:'crew', file:'crew.png', frameWidth:28, frameHeight:28,
      cols:4, rows:1,
      frames: names.map((name,i)=>({ name, col:i, row:0 })),
    });
  }

  // ── Portraits ─────────────────────────────────────────────────────────────────
  {
    const frames = [portrait('tessa'), portrait('orin'), portrait('static')];
    const names  = ['tessa','orin','static'];
    writePNG(makeStrip(frames, 28, 28), join(OUT,'portraits.png'));
    manifest.sheets.push({
      name:'portraits', file:'portraits.png', frameWidth:28, frameHeight:28,
      cols:3, rows:1,
      frames: names.map((name,i)=>({ name, col:i, row:0 })),
    });
  }

  // ── Topsoil tile set ──────────────────────────────────────────────────────────
  // Row 0: 4 dirt variants, floor plain, floor shadowed, 3 bedrock
  // Row 1: 12 edge / corner autotile variants
  // Row 2: 7 corridor autotile variants
  {
    const T = THEMES.A;
    const COLS = 12, ROWS = 3, CW = 16, CH = 16;
    const sheet = new Buf(COLS*CW, ROWS*CH, 0);

    // Row 0
    for (let i=0;i<4;i++){
      const t=new Buf(16,16,0); drawDirt(t,0,0,T,40+i*9); placeTile(sheet,t,i,0,CW,CH);
    }
    { const t=new Buf(16,16,0); drawFloor(t,0,0,T,5,false,false); placeTile(sheet,t,4,0,CW,CH); }
    { const t=new Buf(16,16,0); drawFloor(t,0,0,T,6,true,true);   placeTile(sheet,t,5,0,CW,CH); }
    for(let i=0;i<3;i++){
      const t=new Buf(16,16,0); drawBedrock(t,0,0,60+i*7); placeTile(sheet,t,6+i,0,CW,CH);
    }

    // Row 1: 12 edge/corner variants
    const E1=[{n:1},{e:1},{s:1},{w:1},{n:1,w:1},{n:1,e:1},{s:1,e:1},{s:1,w:1},{nw:1},{ne:1},{se:1},{sw:1}];
    E1.forEach((m,i)=>{
      const t=new Buf(16,16,0); drawDirt(t,0,0,T,77+i,Object.assign({},NOM,m)); placeTile(sheet,t,i,1,CW,CH);
    });

    // Row 2: 7 corridor variants
    const E2=[{n:1,s:1},{e:1,w:1},{n:1,e:1,w:1},{e:1,s:1,w:1},{n:1,e:1,s:1},{n:1,s:1,w:1},{n:1,e:1,s:1,w:1}];
    E2.forEach((m,i)=>{
      const t=new Buf(16,16,0); drawDirt(t,0,0,T,120+i,Object.assign({},NOM,m)); placeTile(sheet,t,i,2,CW,CH);
    });

    writePNG(sheet, join(OUT,'tiles_topsoil.png'), false); // tiles are fully opaque
    manifest.sheets.push({
      name:'tiles_topsoil', file:'tiles_topsoil.png', frameWidth:16, frameHeight:16,
      cols:COLS, rows:ROWS,
      frames: [
        {name:'dirt_0',col:0,row:0},{name:'dirt_1',col:1,row:0},{name:'dirt_2',col:2,row:0},{name:'dirt_3',col:3,row:0},
        {name:'floor',col:4,row:0},{name:'floor_shadowed',col:5,row:0},
        {name:'bedrock_0',col:6,row:0},{name:'bedrock_1',col:7,row:0},{name:'bedrock_2',col:8,row:0},
        {name:'edge_n',col:0,row:1},{name:'edge_e',col:1,row:1},{name:'edge_s',col:2,row:1},{name:'edge_w',col:3,row:1},
        {name:'corner_nw',col:4,row:1},{name:'corner_ne',col:5,row:1},{name:'corner_se',col:6,row:1},{name:'corner_sw',col:7,row:1},
        {name:'concave_nw',col:8,row:1},{name:'concave_ne',col:9,row:1},{name:'concave_se',col:10,row:1},{name:'concave_sw',col:11,row:1},
        {name:'corridor_ns',col:0,row:2},{name:'corridor_ew',col:1,row:2},
        {name:'corridor_new',col:2,row:2},{name:'corridor_esw',col:3,row:2},
        {name:'corridor_nes',col:4,row:2},{name:'corridor_nsw',col:5,row:2},
        {name:'corridor_all',col:6,row:2},
      ],
    });
  }

  // ── HUD pieces ────────────────────────────────────────────────────────────────
  {
    const frames = [
      heart(true), heart(false),
      emerald(true), fuelCan(true),
      makePip(true), makePip(false),
      makeFuelSegment(false), makeFuelSegment(true),
    ];
    const names = ['heart_full','heart_empty','emerald_mini','fuel_mini','pip_filled','pip_empty','fuel_segment','fuel_segment_low'];
    writePNG(makeStrip(frames, 16, 16), join(OUT,'hud.png'));
    manifest.sheets.push({
      name:'hud', file:'hud.png', frameWidth:16, frameHeight:16,
      cols:8, rows:1,
      frames: names.map((name,i)=>({ name, col:i, row:0 })),
    });
  }

  // ── Bitmap font atlas ─────────────────────────────────────────────────────────
  // 5×7 glyph, 6px advance, rendered in white (30) on transparent.
  // Atlas: 10 cols × 6 rows of glyphs (each cell 6×8 px, 1px gap).
  {
    const GCOLS=10, GCELL_W=6, GCELL_H=8;
    const GROWS = Math.ceil(GLY.length/GCOLS);
    const atlas = new Buf(GCOLS*GCELL_W, GROWS*GCELL_H, 255);
    const fontFrames = [];

    GLY.forEach(([ch, raw], idx) => {
      const rows = raw.split(' ').map(row=>{let v=0;for(let i=0;i<5;i++)v=(v<<1)|(row[i]==='#'?1:0);return v;});
      const col = idx % GCOLS, row = Math.floor(idx/GCOLS);
      const ox = col*GCELL_W, oy = row*GCELL_H;
      for (let r=0;r<7;r++) for(let c=0;c<5;c++) if((rows[r]>>(4-c))&1) atlas.px(ox+c,oy+r,30); // white
      fontFrames.push({ char:ch, col, row, x:ox, y:oy });
    });

    writePNG(atlas, join(OUT,'font.png'));

    const fontMetrics = {
      glyphWidth:5, glyphHeight:7, advance:6, boldAdvance:7, linePitch:9,
      atlasWidth: GCOLS*GCELL_W, atlasHeight: GROWS*GCELL_H,
      cellWidth:GCELL_W, cellHeight:GCELL_H, cols:GCOLS, rows:GROWS,
      glyphs: fontFrames,
    };
    const fontMetricsPath = join(OUT,'font.json');
    writeFileSync(fontMetricsPath, JSON.stringify(fontMetrics, null, 2));
    console.log(`  /public/assets/sprites/font.json`);

    manifest.sheets.push({
      name:'font', file:'font.png', frameWidth:GCELL_W, frameHeight:GCELL_H,
      cols:GCOLS, rows:GROWS,
      frames: fontFrames,
    });
  }

  // ── Manifest ──────────────────────────────────────────────────────────────────
  writeFileSync(join(OUT,'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('  /public/assets/sprites/manifest.json');

  // ── Contact sheet ─────────────────────────────────────────────────────────────
  buildContactSheet();

  console.log('\nDone. All pixels use palette colours from docs/palette.json.');
}

function buildContactSheet() {
  // Layout: one row per sprite category, scaled 2×
  const SCALE = 2;
  const PAD   = 4;  // px between categories
  const LABEL_H = 9; // font height + gap

  // We'll draw at 1× and upscale at the end.
  // Collect all category buffers in order.
  const cats = [
    { label:'PLAYER',   buf: makeStrip([rig('up',0),rig('up',1),rig('right',0),rig('right',1),rig('down',0),rig('down',1),rig('left',0),rig('left',1)], 16, 16) },
    { label:'MONSTERS', buf: makeStrip([grub(0,1),grub(1,1),burrower(0),burrower(1),spitter(0,1),spitter(1,1),drifter(0),drifter(1),grubSquash(),spitBolt()], 16, 16) },
    { label:'OBJECTS',  buf: makeStrip([bag(false),bag(true),nugget(),emerald(false),fuelCan(false),nest(0),nest(1),exitShaft(0),exitShaft(1)], 16, 16) },
    { label:'ICONS',    buf: makeStrip(['hull','fuel','drill','pulse','prospector','salvage','pick','lantern','magnet','ping','fuel'].map(icon), 16, 16) },
    { label:'CREW',     buf: makeStrip([tessa(),orin(),radio(0),radio(1)], 28, 28) },
    { label:'PORTRAITS',buf: makeStrip([portrait('tessa'),portrait('orin'),portrait('static')], 28, 28) },
    { label:'HUD',      buf: makeStrip([heart(true),heart(false),emerald(true),fuelCan(true),makePip(true),makePip(false),makeFuelSegment(false),makeFuelSegment(true)], 16, 16) },
  ];

  // Tile sheet (crop row 0 for display)
  {
    const T = THEMES.A;
    const tileRow = new Buf(9*16, 16, 0);
    for(let i=0;i<4;i++){const t=new Buf(16,16,0);drawDirt(t,0,0,T,40+i*9);for(let y=0;y<16;y++)for(let x=0;x<16;x++)tileRow.px(i*16+x,y,t.get(x,y));}
    {const t=new Buf(16,16,0);drawFloor(t,0,0,T,5,false,false);for(let y=0;y<16;y++)for(let x=0;x<16;x++)tileRow.px(4*16+x,y,t.get(x,y));}
    for(let i=0;i<3;i++){const t=new Buf(16,16,0);drawBedrock(t,0,0,60+i*7);for(let y=0;y<16;y++)for(let x=0;x<16;x++)tileRow.px((5+i)*16+x,y,t.get(x,y));}
    {const t=new Buf(16,16,0);drawDirt(t,0,0,T,77,Object.assign({},NOM,{n:1,w:1}));for(let y=0;y<16;y++)for(let x=0;x<16;x++)tileRow.px(8*16+x,y,t.get(x,y));}
    cats.push({ label:'TILES (sample)', buf: tileRow });
  }

  const W1 = Math.max(...cats.map(c=>c.buf.w));
  const H1 = cats.reduce((sum,c)=>sum+LABEL_H+c.buf.h+PAD, PAD);

  const base = new Buf(W1, H1, 2); // dark background

  // Simple label renderer using FONT (colour 25 = cream)
  function drawLabel(b, txt, x, y) {
    for (const ch of txt.toUpperCase()) {
      const g = FONT[ch]; if (!g) { x+=6; continue; }
      for (let r=0;r<7;r++) for(let c=0;c<5;c++) if((g[r]>>(4-c))&1) b.px(x+c,y+r,25);
      x+=6;
    }
  }

  let cy = PAD;
  for (const cat of cats) {
    drawLabel(base, cat.label, PAD, cy); cy += LABEL_H;
    // paste buf (transparent: 255→bg colour 2)
    for (let y=0;y<cat.buf.h;y++) for(let x=0;x<cat.buf.w;x++){
      const v=cat.buf.d[y*cat.buf.w+x]; if(v!==255) base.px(x+PAD, cy+y, v);
    }
    cy += cat.buf.h + PAD;
  }

  // Scale 2×
  const scaled = new Buf(base.w*SCALE, base.h*SCALE, 0);
  for (let y=0;y<base.h;y++) for(let x=0;x<base.w;x++){
    const v=base.d[y*base.w+x];
    for(let sy=0;sy<SCALE;sy++) for(let sx=0;sx<SCALE;sx++) scaled.px(x*SCALE+sx,y*SCALE+sy,v);
  }

  writePNG(scaled, CONTACT, false);
}

run();
