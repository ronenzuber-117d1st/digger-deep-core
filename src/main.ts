import Phaser from 'phaser';
import { BootScene } from './scenes/boot';
import { TitleScene } from './scenes/title';
import { BaseScene } from './scenes/base';
import { DiveScene } from './scenes/dive';
import { DeathScene } from './scenes/death';
import { RunPickScene } from './scenes/floor-clear';
import { ExtractionScene } from './scenes/extraction';
import { SummaryScene } from './scenes/summary';
import { BestRunsScene } from './scenes/best-runs';
import { OptionsScene } from './scenes/options';

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
  scene: [BootScene, TitleScene, BaseScene, DiveScene, DeathScene, RunPickScene, ExtractionScene, SummaryScene, BestRunsScene, OptionsScene],
};

new Phaser.Game(config);
