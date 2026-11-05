import Phaser from 'phaser';
import { FONT_KEY, FONT_SIZE, FONT_ADVANCE, FONT_LINE_HEIGHT } from './font';

const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?-:;/'()[]{}+=#%$@*<>_\"&";
const SCALE = 4;
const CELL_W = FONT_ADVANCE;      // 6
const CELL_H = FONT_LINE_HEIGHT;  // 9
const PER_ROW = 16;
const ATLAS_KEY = '__font_atlas__';

// Phaser's @types omits xAdvance from BitmapFontCharacterData; the runtime reads it.
interface GlyphData {
  x: number; y: number; width: number; height: number;
  centerX: number; centerY: number;
  xOffset: number; yOffset: number;
  u0: number; v0: number; u1: number; v1: number;
  xAdvance: number;
  data: unknown[]; kerning: Record<number, number>;
}

export function installFont(scene: Phaser.Scene, style: 'pixel' | 'smooth'): void {
  if (scene.cache.bitmapFont.has(FONT_KEY)) scene.cache.bitmapFont.remove(FONT_KEY);
  if (scene.textures.exists(ATLAS_KEY)) scene.textures.remove(ATLAS_KEY);

  const rows = Math.ceil(CHARS.length / PER_ROW);
  const atlW = CELL_W * PER_ROW;   // 96 (game pixels)
  const atlH = CELL_H * rows;       // 45 (game pixels, 5 rows × 9)

  const family = style === 'smooth'
    ? "'GameFontSmooth', Arial, sans-serif"
    : 'GameFontPixel';

  // Always render glyphs at SCALE× game resolution (28px)
  const bigW = atlW * SCALE;  // 384
  const bigH = atlH * SCALE;
  const big = document.createElement('canvas');
  big.width = bigW;
  big.height = bigH;
  const bigCtx = big.getContext('2d')!;
  bigCtx.clearRect(0, 0, bigW, bigH);
  bigCtx.font = `${FONT_SIZE * SCALE}px ${family}`;
  bigCtx.fillStyle = '#ffffff';
  bigCtx.textBaseline = 'top';
  for (let i = 0; i < CHARS.length; i++) {
    const col = i % PER_ROW;
    const row = Math.floor(i / PER_ROW);
    bigCtx.fillText(CHARS[i], col * CELL_W * SCALE, row * CELL_H * SCALE);
  }

  if (style === 'smooth') {
    // ── SMOOTH: keep the full 4× atlas; WebGL bilinearly downscales it to game
    // pixels, giving anti-aliased edges instead of hard pixel blocks. ──────────
    const tex = scene.textures.createCanvas(ATLAS_KEY, bigW, bigH)!;
    const ctx = tex.context;
    ctx.drawImage(big, 0, 0);  // 1:1 copy — no downscaling

    // Slight contrast boost so strokes stay solid while edges stay soft
    const imgData = ctx.getImageData(0, 0, bigW, bigH);
    const d = imgData.data;
    for (let p = 0; p < d.length; p += 4) {
      d[p] = 255; d[p + 1] = 255; d[p + 2] = 255;
      d[p + 3] = Math.min(255, Math.round(d[p + 3] * 1.6));
    }
    ctx.putImageData(imgData, 0, 0);
    tex.refresh();

    // Override pixelArt:true's global NEAREST with LINEAR for this texture
    // so WebGL bilinearly downscales the 4× glyphs to game-pixel size.
    try {
      (tex.source[0] as unknown as { setFilter(f: number): void })
        .setFilter(Phaser.Textures.FilterMode.LINEAR);
    } catch { /* fall back to NEAREST if WebGL doesn't support it */ }

    const chars: Record<number, GlyphData> = {};
    for (let i = 0; i < CHARS.length; i++) {
      const col = i % PER_ROW;
      const row = Math.floor(i / PER_ROW);
      const cx = col * CELL_W * SCALE;
      const cy = row * CELL_H * SCALE;
      const code = CHARS.charCodeAt(i);
      chars[code] = {
        x: cx, y: cy,
        width: CELL_W * SCALE, height: FONT_SIZE * SCALE,
        centerX: cx + (CELL_W * SCALE) / 2, centerY: cy + (FONT_SIZE * SCALE) / 2,
        xOffset: 0, yOffset: 0,
        // UVs: same ratios as pixel mode (SCALE cancels out)
        u0: (col * CELL_W) / atlW,         v0: (row * CELL_H) / atlH,
        u1: (col * CELL_W + CELL_W) / atlW, v1: (row * CELL_H + FONT_SIZE) / atlH,
        xAdvance: FONT_ADVANCE * SCALE,
        data: [], kerning: {},
      };
    }

    scene.cache.bitmapFont.add(FONT_KEY, {
      data: {
        font: 'GameFontSmooth',
        size: FONT_SIZE * SCALE,
        lineHeight: CELL_H * SCALE,
        retroFont: false,
        chars: chars as unknown as Record<number, Phaser.Types.GameObjects.BitmapText.BitmapFontCharacterData>,
      } as Phaser.Types.GameObjects.BitmapText.BitmapFontData,
      texture: ATLAS_KEY,
      frame: null as unknown as string,
    });

  } else {
    // ── PIXEL: downsample to game resolution + hard threshold ─────────────────
    const tex = scene.textures.createCanvas(ATLAS_KEY, atlW, atlH)!;
    const ctx = tex.context;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(big, 0, 0, atlW, atlH);

    const imgData = ctx.getImageData(0, 0, atlW, atlH);
    const d = imgData.data;
    for (let p = 0; p < d.length; p += 4) {
      const on = d[p + 3] > 64;
      d[p]     = on ? 255 : 0;
      d[p + 1] = on ? 255 : 0;
      d[p + 2] = on ? 255 : 0;
      d[p + 3] = on ? 255 : 0;
    }
    ctx.putImageData(imgData, 0, 0);
    tex.refresh();

    const chars: Record<number, GlyphData> = {};
    for (let i = 0; i < CHARS.length; i++) {
      const col = i % PER_ROW;
      const row = Math.floor(i / PER_ROW);
      const cx = col * CELL_W;
      const cy = row * CELL_H;
      const code = CHARS.charCodeAt(i);
      chars[code] = {
        x: cx, y: cy,
        width: CELL_W, height: FONT_SIZE,
        centerX: cx + CELL_W / 2, centerY: cy + FONT_SIZE / 2,
        xOffset: 0, yOffset: 0,
        u0: cx / atlW,             v0: cy / atlH,
        u1: (cx + CELL_W) / atlW,  v1: (cy + FONT_SIZE) / atlH,
        xAdvance: FONT_ADVANCE,
        data: [], kerning: {},
      };
    }

    scene.cache.bitmapFont.add(FONT_KEY, {
      data: {
        font: 'GameFontPixel',
        size: FONT_SIZE,
        lineHeight: CELL_H,
        retroFont: false,
        chars: chars as unknown as Record<number, Phaser.Types.GameObjects.BitmapText.BitmapFontCharacterData>,
      } as Phaser.Types.GameObjects.BitmapText.BitmapFontData,
      texture: ATLAS_KEY,
      frame: null as unknown as string,
    });

  }
}
