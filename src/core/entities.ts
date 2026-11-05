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
  lastHFacing: 'left' | 'right';
  moving: boolean;
  moveProgress: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isDigging: boolean;
  pulseTimer: number;
  fuelStarveMult: number;  // 1 = full speed, 0 = stopped (fuel-empty penalty)
  pulseDamage: number;
  digSpeedMult: number;
  shield: boolean;
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
  facing: 'left' | 'right';
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
  facing: 'left' | 'right';
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
  noDirTimer: number;
  isDigging: boolean;
  facing: 'left' | 'right';
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
  heavyCrushUsed: boolean;
  breakTimer: number;  // > 0: showing bag_landed, waiting to spawn nuggets
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
  surfaceDelay: number;  // counts down before the nest begins surfacing; tile stays Dirt until 0
  surfacing: boolean;    // true while the emerge animation is playing
  surfaceFrame: number;  // 0.0–13.0, advances at surfaceAnimSpeed fps
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

export interface DrifterEntity {
  kind: 'drifter';
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
  facing: 'left' | 'right';
}

export type MonsterEntity = GrubEntity | BurrowerEntity | SpitterEntity | DrifterEntity;

export type Entity =
  | GrubEntity
  | BurrowerEntity
  | SpitterEntity
  | DrifterEntity
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
  pulseDamage = 0,
  digSpeedMult = 1,
): PlayerEntity {
  return {
    x, y, hp, maxHp, invulTimer: 0, fuel, maxFuel, emeralds: 0,
    facing: 'right', lastHFacing: 'right',
    moving: false, moveProgress: 0, fromX: x, fromY: y, toX: x, toY: y,
    isDigging: false, pulseTimer: 0, fuelStarveMult: 1,
    pulseDamage, digSpeedMult, shield: false,
  };
}
