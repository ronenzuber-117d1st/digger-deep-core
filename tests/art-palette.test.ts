import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);
const ROOT = join(__dir, '..');
const SPRITES_DIR = join(ROOT, 'public/assets/sprites');
const spritesExist = existsSync(SPRITES_DIR);

// Build valid-colour set from docs/palette.json (source of truth)
const paletteJson = JSON.parse(readFileSync(join(ROOT, 'docs/palette.json'), 'utf8')) as {
  colors: { index: number; hex: string }[];
};
const VALID_COLORS = new Set(paletteJson.colors.map(c => c.hex.toLowerCase()));

describe('sprite palette compliance', () => {
  it.skipIf(!spritesExist)(
    'every opaque pixel in exported PNGs uses a colour from docs/palette.json',
    () => {
      const pngFiles = readdirSync(SPRITES_DIR).filter(f => f.endsWith('.png'));
      expect(pngFiles.length).toBeGreaterThan(0);

      for (const file of pngFiles) {
        const data = readFileSync(join(SPRITES_DIR, file));
        const png  = PNG.sync.read(data);
        for (let i = 0; i < png.data.length; i += 4) {
          const a = png.data[i + 3];
          if (a === 0) continue; // transparent — exempt
          const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
          const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
          expect(
            VALID_COLORS.has(hex),
            `${file}: pixel ${i / 4} has colour ${hex} which is not in docs/palette.json`,
          ).toBe(true);
        }
      }
    },
  );
});
