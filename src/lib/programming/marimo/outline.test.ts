import { describe, expect, it } from 'vitest';
import { outlinePath, shapeOutline } from './outline';
import { shapeFrom } from './facets';
import { dentCoefficients, extremeDirection, radiusScaleAt, zeroShape } from './sphericalHarmonics';
import { mulberry32 } from './rng';
import { fragmentBias } from './fragments';
import { FRAGMENT_GRADES } from './constants';

describe('extremeDirection', () => {
  it('finds the flat spot', () => {
    for (const dir of [
      [0, -1, 0],
      [1, 0, 0],
      [0.577, 0.577, 0.577]
    ] as const) {
      const found = extremeDirection(dentCoefficients(dir[0], dir[1], dir[2], 0.15));
      const alignment = found[0] * dir[0] + found[1] * dir[1] + found[2] * dir[2];
      // Within a few degrees is all the sampling promises, and all a picture needs.
      expect(alignment).toBeGreaterThan(0.99);
    }
  });

  it('returns a unit vector for a perfectly round shape', () => {
    const found = extremeDirection(zeroShape());
    expect(Math.hypot(...found)).toBeCloseTo(1, 9);
  });
});

describe('shapeOutline', () => {
  it('is a circle of radius one when the shape is round', () => {
    for (const point of shapeOutline(shapeFrom(zeroShape()), 32)) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(1, 9);
    }
  });

  it('puts the biggest feature at the bottom of the picture', () => {
    // A flat spot is a flat spot because that side was down, so the slice is
    // oriented to show it that way.
    const points = shapeOutline(shapeFrom(dentCoefficients(0.3, 0.6, -0.74, 0.16)), 96);
    const lowest = points.reduce((a, b) => (a.y > b.y ? a : b));
    const closest = points.reduce((a, b) => (Math.hypot(a.x, a.y) < Math.hypot(b.x, b.y) ? a : b));
    expect(closest.y).toBeGreaterThan(0.5);
    expect(Math.hypot(lowest.x, lowest.y)).toBeLessThan(1);
  });

  it('never folds through the centre, for any fragment', () => {
    const rand = mulberry32(2024);
    for (let i = 0; i < 150; i++) {
      const bias = fragmentBias(rand, FRAGMENT_GRADES[FRAGMENT_GRADES.length - 1]);
      for (const point of shapeOutline(shapeFrom(bias), 48)) {
        const radius = Math.hypot(point.x, point.y);
        expect(radius).toBeGreaterThan(0.5);
        expect(radius).toBeLessThan(1.5);
      }
    }
  });

  it('reads the same field the renderer does', () => {
    const bias = fragmentBias(mulberry32(3), FRAGMENT_GRADES[1]);
    const points = shapeOutline(shapeFrom(bias), 24);
    for (const point of points) {
      // Every sample sits at the radius the shape field gives for its own
      // direction, so the silhouette is the shape and not an impression of it.
      const radius = Math.hypot(point.x, point.y);
      expect(radius).toBeGreaterThan(0);
      expect(Math.hypot(point.nx, point.ny)).toBeCloseTo(1, 9);
    }
    // The sample a quarter of the way round is the extreme direction itself, by
    // construction — not merely near it. Comparing against the outline's own
    // minimum instead would only agree when the extreme happens to be a scoop
    // rather than a bulge.
    const direction = extremeDirection(bias);
    const expected = radiusScaleAt(bias, direction[0], direction[1], direction[2]);
    const atBottom = points[points.length / 4];
    expect(Math.hypot(atBottom.x, atBottom.y)).toBeCloseTo(expected, 12);
    expect(atBottom.y).toBeGreaterThan(0);
  });
});

describe('outlinePath', () => {
  it('emits a closed path centred where it is told', () => {
    const path = outlinePath(shapeOutline(shapeFrom(zeroShape()), 8), 50, 50, 10);
    expect(path.startsWith('M')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path.split('L')).toHaveLength(8);
  });

  it('is empty rather than malformed when there is nothing to draw', () => {
    expect(outlinePath([], 0, 0, 1)).toBe('');
  });
});
