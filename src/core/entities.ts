export type Direction = 'up' | 'down' | 'left' | 'right';

export interface PlayerEntity {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  invulTimer: number;
  fuel: number;
  maxFuel: number;
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
  pulseDamage: number;
  digSpeedMult: number;
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

export interface BurrowerEntity {
  kind: 'burrower';
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
  noDirTimer: number;
  isDigging: boolean;
}

export interface SpitterEntity {
  kind: 'spitter';
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
  fireTimer: number;
}

export interface ProjectileEntity {
  kind: 'projectile';
  id: number;
  x: number;
  y: number;
  dir: Direction;
  moveProgress: number;
  damage: number;
  ownerId: number;
}

export interface BagEntity {
  kind: 'bag';
  id: number;
  x: number;
  y: number;
  falling: boolean;
  fallProgress: number;
  fallDistance: number;
  pendingFallTimer: number;
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

export type MonsterEntity = GrubEntity | BurrowerEntity | SpitterEntity;

export type Entity =
  | GrubEntity
  | BurrowerEntity
  | SpitterEntity
  | ProjectileEntity
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

export function createPlayer(
  x: number,
  y: number,
  hp: number,
  maxHp: number,
  fuel: number,
  maxFuel: number,
  pulseDamage = 1,
  digSpeedMult = 1,
): PlayerEntity {
  return {
    x, y, hp, maxHp, invulTimer: 0, fuel, maxFuel, emeralds: 0,
    facing: 'right',
    moving: false, moveProgress: 0, fromX: x, fromY: y, toX: x, toY: y,
    isDigging: false, pulseTimer: 0, fuelDamageAccum: 0,
    pulseDamage, digSpeedMult,
  };
}
