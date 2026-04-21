import { describe, it, expect } from 'vitest';
import type { BadgePath, Vec2 } from '../store/types';
import { collectWallPolygons } from './planar';

function linePath(
  id: string,
  kind: BadgePath['kind'],
  points: Vec2[],
  strokeWidth: number,
  closed = false
): BadgePath {
  return {
    id,
    kind,
    closed,
    start: points[0],
    nodes: points.slice(1).map((to) => ({ type: 'line' as const, to })),
    strokeWidth
  };
}

function boundingBox(points: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

describe('collectWallPolygons — divider clipping', () => {
  it('clips a divider whose endpoint sits flush with the outline (no bump past the boundary)', () => {
    // Square outline 0..10 in both dimensions.
    const outline = linePath(
      'o',
      'shape',
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ],
      0,
      true
    );
    // Horizontal divider across the middle, endpoint lands on the right outline edge.
    // Width 2 means the thickened polygon would extend x=10..11 past the edge.
    const divider = linePath(
      'd',
      'shape',
      [
        { x: 2, y: 5 },
        { x: 10, y: 5 }
      ],
      2
    );

    const { dividers } = collectWallPolygons([outline, divider]);

    expect(dividers.length).toBeGreaterThan(0);
    const bbox = boundingBox(dividers.flatMap((d) => d.points));
    // No divider geometry may extend past x=10; allow a small epsilon for the clipper.
    expect(bbox.maxX).toBeLessThanOrEqual(10 + 1e-6);
  });

  it('splits a divider that crosses fully through the outline into segments inside the outline only', () => {
    const outline = linePath(
      'o',
      'shape',
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ],
      0,
      true
    );
    // Divider extends well past both edges in x.
    const divider = linePath(
      'd',
      'shape',
      [
        { x: -5, y: 5 },
        { x: 15, y: 5 }
      ],
      2
    );

    const { dividers } = collectWallPolygons([outline, divider]);

    expect(dividers.length).toBeGreaterThan(0);
    const bbox = boundingBox(dividers.flatMap((d) => d.points));
    expect(bbox.minX).toBeGreaterThanOrEqual(0 - 1e-6);
    expect(bbox.maxX).toBeLessThanOrEqual(10 + 1e-6);
  });

  it('leaves a divider entirely inside the outline unchanged in extent', () => {
    const outline = linePath(
      'o',
      'shape',
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 }
      ],
      0,
      true
    );
    const divider = linePath(
      'd',
      'shape',
      [
        { x: 5, y: 10 },
        { x: 15, y: 10 }
      ],
      2
    );

    const { dividers } = collectWallPolygons([outline, divider]);

    expect(dividers.length).toBe(1);
    const bbox = boundingBox(dividers[0].points);
    // Fully inside: thickening gives y=9..11, x≈4..16 with round caps that
    // extend half a stroke-width (1 mm here) past each endpoint.
    expect(bbox.minX).toBeCloseTo(4, 5);
    expect(bbox.maxX).toBeCloseTo(16, 5);
    expect(bbox.minY).toBeCloseTo(9, 5);
    expect(bbox.maxY).toBeCloseTo(11, 5);
  });

  it('drops a divider entirely outside the outline', () => {
    const outline = linePath(
      'o',
      'shape',
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ],
      0,
      true
    );
    const divider = linePath(
      'd',
      'shape',
      [
        { x: 20, y: 5 },
        { x: 30, y: 5 }
      ],
      2
    );

    const { dividers } = collectWallPolygons([outline, divider]);

    expect(dividers.length).toBe(0);
  });

  it('skips clipping when there is no outline (leaves dividers as-is)', () => {
    const divider = linePath(
      'd',
      'shape',
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      ],
      2
    );

    const { dividers } = collectWallPolygons([divider]);

    expect(dividers.length).toBe(1);
  });
});
