import Phaser from 'phaser';
import manifest from '../../public/assets/sprites/manifest.json';
import { preloadAllTracks } from '../audio/index';

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
    for (let i = 0; i < 7; i++) {
      this.load.image(`camp_${i}`, `assets/camp/camp_${i}.png`);
    }
    for (let i = 0; i <= 13; i++) {
      this.load.image(`nest_surface_${i}`, `assets/nest/nest_${i}.png`);
    }
    for (let i = 0; i <= 1; i++) {
      this.load.image(`nugget_pile_${i}`, `assets/nuggets/nugget_pile_${i}.png`);
    }
    for (let i = 0; i <= 3; i++) {
      this.load.image(`chomper_left_${i}`, `assets/chomper/chomper_left_${i}.png`);
      this.load.image(`chomper_right_${i}`, `assets/chomper/chomper_right_${i}.png`);
      this.load.image(`chomper_down_${i}`, `assets/chomper/chomper_down_${i}.png`);
      this.load.image(`pulse_${i}`, `assets/pulse/pulse_${i}.png`);
      this.load.image(`pulse_hit_${i}`, `assets/pulse/pulse_hit_${i}.png`);
    }
    for (let i = 0; i <= 15; i++) {
      const f = i.toString().padStart(2, '0');
      this.load.image(`chomper_death_left_${f}`, `assets/chomper/chomper_death_left_${f}.png`);
      this.load.image(`chomper_death_right_${f}`, `assets/chomper/chomper_death_right_${f}.png`);
    }
    for (let i = 0; i < 8; i++) {
      this.load.image(`grub_death_left_${i}`,      `assets/enemy-death/grub_death_left_${i}.png`);
      this.load.image(`grub_death_right_${i}`,     `assets/enemy-death/grub_death_right_${i}.png`);
      this.load.image(`burrower_death_front_${i}`, `assets/enemy-death/burrower_death_front_${i}.png`);
      this.load.image(`spitter_death_left_${i}`,   `assets/enemy-death/spitter_death_left_${i}.png`);
      this.load.image(`spitter_death_right_${i}`,  `assets/enemy-death/spitter_death_right_${i}.png`);
      this.load.image(`drifter_death_front_${i}`,  `assets/enemy-death/drifter_death_front_${i}.png`);
    }
  }

  create(): void {
    registerNamedFrames(this);
    void preloadAllTracks();  // fetch + parse all .mid files before first user gesture
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
