export interface Player {
  x: number;
  y: number;
  fuel: number;
  emeralds: number;
  alive: boolean;
}

export interface Monster {
  id: number;
  type: string;
  x: number;
  y: number;
  hp: number;
}

export interface GameEntities {
  player: Player;
  monsters: Monster[];
}

export function createPlayer(x: number, y: number): Player {
  return { x, y, fuel: 100, emeralds: 0, alive: true };
}
