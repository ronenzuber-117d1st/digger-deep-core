import Phaser from 'phaser';
import manifest from '../../public/assets/sprites/manifest.json';

type SheetEntry = (typeof manifest.sheets)[number];
type FrameEntry = SheetEntry['frames'][number];

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  preload(): void {
    for (const sheet of manifest.sheets) {
      if (sheet.name === 'font') continue; // loaded as bitmapFont below
      this.load.spritesheet(sheet.name, `assets/sprites/${sheet.file}`, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }
    this.load.bitmapFont('coalface', 'assets/sprites/font.png', 'assets/sprites/font.xml');
    this.load.image('title_a', 'assets/title/title_a.png');
    this.load.image('title_b', 'assets/title/title_b.png');
  }

  create(): void {
    registerNamedFrames(this);
    this.scene.start('Title');
  }
}

export function registerNamedFrames(scene: Phaser.Scene): void {
  for (const sheet of manifest.sheets) {
    if (sheet.name === 'font') continue;
    const tex = scene.textures.get(sheet.name);
    for (const f of sheet.frames as FrameEntry[]) {
      const name: string = (f as { name?: string; char?: string }).name
        ?? (f as { char?: string }).char
        ?? '';
      if (!name) continue;
      const px = f.col * sheet.frameWidth;
      const py = f.row * sheet.frameHeight;
      if (!tex.has(name)) {
        tex.add(name, 0, px, py, sheet.frameWidth, sheet.frameHeight);
      }
    }
  }
}
