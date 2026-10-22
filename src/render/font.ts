import Phaser from 'phaser';

export const FONT_KEY = 'coalface';
export const FONT_SIZE = 7;
export const FONT_ADVANCE = 6;
export const FONT_LINE_HEIGHT = 9;

export const COLOR = {
  body:    0xe8e6df,
  heading: 0xf0a04b,
  bold:    0xffffff,
  soft:    0x78768a,
  muted:   0x43365f,
  warn:    0xf28f2e,
  good:    0x5bc46a,
  amber:   0xf0a04b,
  cyan:    0x5bb8e8,
  gold:    0xf7c94b,
  green:   0x5bc46a,
  red:     0xe0502f,
  purple:  0x9b59b6,
};

export function measureText(text: string, size = FONT_SIZE): number {
  return text.toUpperCase().length * FONT_ADVANCE * (size / FONT_SIZE);
}

export function bitmapLabel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  tint = COLOR.body,
  size = FONT_SIZE,
): Phaser.GameObjects.BitmapText {
  return scene.add
    .bitmapText(x, y, FONT_KEY, text.toUpperCase(), size)
    .setTint(tint);
}

export function bitmapLabelShadow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  tint = COLOR.body,
  size = FONT_SIZE,
): [Phaser.GameObjects.BitmapText, Phaser.GameObjects.BitmapText] {
  const shadow = scene.add
    .bitmapText(x + 1, y + 1, FONT_KEY, text.toUpperCase(), size)
    .setTint(0x000000);
  const main = scene.add
    .bitmapText(x, y, FONT_KEY, text.toUpperCase(), size)
    .setTint(tint);
  return [shadow, main];
}
