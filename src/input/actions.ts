export enum Action {
  MoveUp = 'MoveUp',
  MoveDown = 'MoveDown',
  MoveLeft = 'MoveLeft',
  MoveRight = 'MoveRight',
  Interact = 'Interact',
  Pause = 'Pause',
}

export interface InputSnapshot {
  moveUp: boolean;
  moveDown: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  pause: boolean;
}

export function emptyInput(): InputSnapshot {
  return { moveUp: false, moveDown: false, moveLeft: false, moveRight: false, pause: false };
}
