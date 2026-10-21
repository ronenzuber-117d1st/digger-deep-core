export type Direction = 'up' | 'down' | 'left' | 'right';

export interface PlayerEntity {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  invulTimer: number;
  fuel: number;
  emeralds: number;
  facing: Direction;
  moving: boolean;
  moveProgress: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isDigging: boolean;
  pulseTimer: number;
  fuelDamageAccum: number;
}

export interface GrubEntity {
  kind: 'grub';
  id: number;
  x: number;
  y: number;
  hp: number;
  moving: boolean;
  moveProgress: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  pathTimer: number;
  nextDir: Direction | null;
}

export interface BagEntity {
  kind: 'bag';
  id: number;
  x: number;
  y: number;
  falling: boolean;
  fallProgress: number;
  fallDistance: number;
}

export interface NuggetEntity {
  kind: 'nugget';
  id: number;
  x: number;
  y: number;
  timer: number;
}

export interface NestEntity {
  kind: 'nest';
  id: number;
  x: number;
  y: number;
  hp: number;
  spawnTimer: number;
  spawnCount: number;
}

export interface FuelEntity {
  kind: 'fuel';
  id: number;
  x: number;
  y: number;
}

export interface GemEntity {
  kind: 'gem';
  id: number;
  x: number;
  y: number;
}

export type Entity =
  | GrubEntity
  | BagEntity
  | NuggetEntity
  | NestEntity
  | FuelEntity
  | GemEntity;

export function dirDelta(dir: Direction): { dx: number; dy: number } {
  switch (dir) {
    case 'up': return { dx: 0, dy: -1 };
    case 'down': return { dx: 0, dy: 1 };
    case 'left': return { dx: -1, dy: 0 };
    case 'right': return { dx: 1, dy: 0 };
  }
}

export function createPlayer(x: number, y: number, hp: number, fuel: number): PlayerEntity {
  return {
    x, y, hp, maxHp: hp, invulTimer: 0, fuel, emeralds: 0,
    facing: 'right',
    moving: false, moveProgress: 0, fromX: x, fromY: y, toX: x, toY: y,
    isDigging: false, pulseTimer: 0, fuelDamageAccum: 0,
  };
}
