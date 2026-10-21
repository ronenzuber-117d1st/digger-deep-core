import Phaser from 'phaser';
import { BootScene } from './scenes/boot';
import { DiveScene } from './scenes/dive';
import { DeathScene } from './scenes/death';
import { FloorClearScene } from './scenes/floor-clear';

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
  scene: [BootScene, DiveScene, DeathScene, FloorClearScene],
};

new Phaser.Game(config);
