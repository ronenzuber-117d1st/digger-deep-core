import { SaveData } from '../core/save';

export interface RunCarry {
  seed: number;
  floor: number;
  hp: number;
  maxHp: number;
  fuel: number;
  maxFuel: number;
  emeralds: number;
  kills: number;
  saveData: SaveData;
}
