import { describe, it, expect } from 'vitest';
import { measureText, FONT_ADVANCE, FONT_SIZE } from '../src/render/font';

describe('measureText', () => {
  it('returns 0 for empty string', () => {
    expect(measureText('')).toBe(0);
  });

  it('returns FONT_ADVANCE per character at default size', () => {
    expect(measureText('A')).toBe(FONT_ADVANCE);
    expect(measureText('AB')).toBe(FONT_ADVANCE * 2);
    expect(measureText('ABC')).toBe(FONT_ADVANCE * 3);
  });

  it('uppercases before measuring', () => {
    expect(measureText('abc')).toBe(measureText('ABC'));
  });

  it('returns double width at 2x size', () => {
    expect(measureText('DEEP CORE', FONT_SIZE * 2)).toBe(measureText('DEEP CORE') * 2);
  });

  it('space character is counted as a character', () => {
    expect(measureText('A B')).toBe(FONT_ADVANCE * 3);
  });

  it('fits 16 chars across 96 px at default size', () => {
    const text = 'ABCDEFGHIJKLMNOP'; // 16 chars
    expect(measureText(text)).toBe(FONT_ADVANCE * 16);
  });

  it('handles special characters counted in width', () => {
    expect(measureText('FLOOR 3')).toBe(FONT_ADVANCE * 7);
  });

  it('30-percent-longer text is still measurable', () => {
    const base = 'UPGRADE BENCH';
    const longer = 'UPGRADE BENCH WITH MORE TEXT XX';
    expect(measureText(longer)).toBeGreaterThan(measureText(base));
  });
});
