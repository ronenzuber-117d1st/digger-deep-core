import { Grid } from './grid';
import { PlayerEntity, Entity } from './entities';

export type RunPhase = 'playing' | 'dead' | 'floor-clear' | 'extraction';

export interface RunState {
  seed: number;
  floor: number;
  grid: Grid;
  player: PlayerEntity;
  entities: Entity[];
  nextId: number;
  phase: RunPhase;
  kills: number;
}
