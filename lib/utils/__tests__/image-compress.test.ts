import { describe, expect, it } from 'vitest';
import { fitWithin } from '../image-compress';

describe('fitWithin', () => {
  it('downscales landscape keeping aspect ratio', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
  });
  it('downscales portrait keeping aspect ratio', () => {
    expect(fitWithin(3024, 4032, 2000)).toEqual({ width: 1500, height: 2000 });
  });
  it('never upscales small images', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
  it('keeps exact max edge unchanged', () => {
    expect(fitWithin(2000, 1000, 2000)).toEqual({ width: 2000, height: 1000 });
  });
  it('keeps at least 1px for extreme ratios', () => {
    expect(fitWithin(10000, 1, 2000)).toEqual({ width: 2000, height: 1 });
  });
  it('rejects invalid sizes', () => {
    expect(() => fitWithin(0, 100, 2000)).toThrow();
    expect(() => fitWithin(100, Number.NaN, 2000)).toThrow();
    expect(() => fitWithin(100, 100, 0)).toThrow();
  });
});
