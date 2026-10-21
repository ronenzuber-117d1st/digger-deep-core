import Phaser from 'phaser';
import { BootScene } from './scenes/boot';
import { TitleScene } from './scenes/title';
import { BaseScene } from './scenes/base';
import { DiveScene } from './scenes/dive';
import { DeathScene } from './scenes/death';
import { FloorClearScene } from './scenes/floor-clear';
import { ExtractionScene } from './scenes/extraction';
import { SummaryScene } from './scenes/summary';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 480,
  height: 272,
  backgroundColor: '#1a0a2e',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, BaseScene, DiveScene, DeathScene, FloorClearScene, ExtractionScene, SummaryScene],
};

new Phaser.Game(config);
