export type GameEvent =
  | { type: 'dig'; x: number; y: number; dir: string }
  | { type: 'pickup'; kind: 'gem' | 'nugget' | 'fuel'; value: number }
  | { type: 'hit'; source: 'monster' | 'bag' | 'fuel-empty' }
  | { type: 'bag-fall';  x: number; y: number }
  | { type: 'bag-break'; x: number; y: number }
  | { type: 'floor-clear' }
  | { type: 'extraction' }
  | { type: 'death' }
  | { type: 'pulse-fire'; x: number; y: number; dir: string; range: number }
  | { type: 'kill'; targetId: number; kind: 'grub' | 'burrower' | 'spitter' | 'drifter' | 'nest'; x: number; y: number; facing: 'left' | 'right' }
  | { type: 'spawn'; kind: 'grub' | 'burrower' | 'spitter'; x: number; y: number }
  | { type: 'fuel-starved' };
