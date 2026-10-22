export type GameEvent =
  | { type: 'dig' }
  | { type: 'pickup'; kind: 'gem' | 'nugget' | 'fuel' }
  | { type: 'hit'; source: 'monster' | 'bag' | 'fuel-empty' }
  | { type: 'bag-break'; x: number; y: number }
  | { type: 'floor-clear' }
  | { type: 'extraction' }
  | { type: 'death' }
  | { type: 'pulse-fire'; x: number; y: number; dir: string }
  | { type: 'kill'; targetId: number; kind: 'grub' | 'burrower' | 'spitter' | 'nest' }
  | { type: 'spawn'; kind: 'grub' | 'burrower' | 'spitter'; x: number; y: number };
