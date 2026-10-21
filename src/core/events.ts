export type GameEvent =
  | { type: 'pickup'; kind: 'gem' | 'nugget' | 'fuel' }
  | { type: 'hit'; source: 'monster' | 'bag' | 'fuel-empty' }
  | { type: 'bag-break'; x: number; y: number }
  | { type: 'floor-clear' }
  | { type: 'death' }
  | { type: 'pulse-fire'; x: number; y: number; dir: string }
  | { type: 'kill'; targetId: number; kind: 'grub' | 'nest' };
