import { describe, it, expect } from 'vitest';
import {
  buildPaintColorResolver,
  DEFAULT_PAINT_COLOR_DISTRIBUTION,
  mergePaintColorDistribution
} from './paintColorDistribution';
import { bayerThreshold, buildFloydSteinbergMap, paintColorIndexForCoord } from './paintColorDistributionMath';

describe('paintColorDistribution', () => {
  it('mergePaintColorDistribution preserves defaults for empty input', () => {
    const m = mergePaintColorDistribution(null);
    expect(m.mode).toBe('whiteNoise');
    expect(m.fbm.octaves).toBe(DEFAULT_PAINT_COLOR_DISTRIBUTION.fbm.octaves);
  });

  it('randomSingle: same seed yields same color', () => {
    const state = { ...DEFAULT_PAINT_COLOR_DISTRIBUTION, mode: 'randomSingle' as const };
    const colors = [0xff0000, 0x00ff00, 0x0000ff];
    const a = buildPaintColorResolver(state, colors, 'plastic', { strokeSeed: 0xdeadbeef })(0, 0, 0);
    const b = buildPaintColorResolver(state, colors, 'plastic', { strokeSeed: 0xdeadbeef })(9, 9, 9);
    expect(a.color).toBe(b.color);
  });

  it('whiteNoise matches legacy index mapping', () => {
    const state = { ...DEFAULT_PAINT_COLOR_DISTRIBUTION, mode: 'whiteNoise' as const };
    const colors = [0xff0000, 0x00ff00];
    const r = buildPaintColorResolver(state, colors, 'plastic');
    const idx = paintColorIndexForCoord(2, 3, 4, 2);
    expect(r(2, 3, 4).color).toBe(colors[idx]);
  });

  it('bayerThreshold is in [0,1)', () => {
    expect(bayerThreshold(4, 0, 0)).toBeGreaterThanOrEqual(0);
    expect(bayerThreshold(4, 3, 3)).toBeLessThan(1);
  });

  it('floydSteinberg on 2x2 plane returns map for all positions', () => {
    const positions: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0]
    ];
    const colors = [0x111111, 0xeeeeee];
    const m = buildFloydSteinbergMap(
      positions,
      () => 0.5,
      colors,
      true
    );
    expect(m).not.toBeNull();
    expect(m!.size).toBe(4);
  });
});
