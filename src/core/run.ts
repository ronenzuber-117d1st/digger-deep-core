import { GameEntities } from './entities';
import { Grid } from './grid';

export interface RunState {
  seed: number;
  floor: number;
  entities: GameEntities;
  grid: Grid;
}
