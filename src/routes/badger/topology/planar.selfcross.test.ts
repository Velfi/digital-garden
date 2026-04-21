import { describe, it, expect } from 'vitest';
import type { BadgePath, Vec2 } from '../store/types';
import { emptyDocument } from '../store/types';
import { computeTopology } from './planar';

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

describe('computeTopology — self-intersecting outline (bowtie)', () => {
  it('splits a bowtie outline into two disjoint outline rings and two cells', () => {
    const doc = emptyDocument(200, 200);
    // Bowtie: the two diagonals of a square, traversed as a single closed
    // path, cross at the centre. Under non-zero fill this is two triangular
    // lobes that should each become their own cell.
    doc.metal.paths = [
      linePath(
        'o',
        'shape',
        [
          { x: 10, y: 10 },
          { x: 190, y: 190 },
          { x: 190, y: 10 },
          { x: 10, y: 190 }
        ],
        0,
        true
      )
    ];
    const topo = computeTopology(doc);
    // The bowtie is now two disjoint outline rings, so the topology reports
    // two outline polygons (not one self-intersecting blob).
    expect(topo.outlineUnion.length).toBe(2);
    // Each triangular lobe becomes a cell. Cells should be comparable in
    // size — with equal lobes they should be equal up to flattening noise.
    expect(topo.cells.length).toBe(2);
    const areas = topo.cells.map((c) => c.area).sort((a, b) => a - b);
    expect(areas[0]).toBeGreaterThan(0);
    expect(areas[1] / areas[0]).toBeCloseTo(1, 1);
  });
});

describe('computeTopology — self-intersecting cutout (bowtie)', () => {
  it('splits a bowtie cutout into two disjoint cutout holes', () => {
    const doc = emptyDocument(200, 200);
    // Square outline 0..200. The bowtie cutout is offset off-centre so the
    // outline face's centroid (200,200 → 100,100) doesn't coincide with the
    // bowtie's crossover point; otherwise pointInsideBadge would treat the
    // centroid as inside the cutout and reject the face.
    doc.metal.paths = [
      linePath(
        'o',
        'shape',
        [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
          { x: 200, y: 200 },
          { x: 0, y: 200 }
        ],
        0,
        true
      ),
      // Bowtie cutout: two triangular holes punched through the outline,
      // centred around (140, 60) so the outer face's centroid stays in
      // the negative space.
      linePath(
        'c',
        'cutout',
        [
          { x: 110, y: 30 },
          { x: 170, y: 90 },
          { x: 170, y: 30 },
          { x: 110, y: 90 }
        ],
        0,
        true
      )
    ];
    const topo = computeTopology(doc);
    // Two disjoint cutout rings, not one self-intersecting ring.
    expect(topo.cutouts.length).toBe(2);
    // The silhouette is still one rectangle.
    expect(topo.outlineUnion.length).toBe(1);
    // One cell covers the rectangle (cutouts aren't subtracted from cell
    // area — they're handled at mesh time by punching through the base).
    expect(topo.cells.length).toBe(1);
    // Each cutout ring is a simple triangle of ~1800 mm² (60×60 / 2).
    for (const ct of topo.cutouts) {
      expect(ct.length).toBe(3);
    }
  });
});

describe('computeTopology — self-intersecting divider', () => {
  it('creates an interior cell inside the loop of a self-crossing stroke', () => {
    const doc = emptyDocument(100, 140);
    doc.metal.paths = [
      linePath(
        'o',
        'shape',
        [
          { x: 5, y: 5 },
          { x: 95, y: 5 },
          { x: 95, y: 135 },
          { x: 5, y: 135 }
        ],
        0,
        true
      ),
      // Open stroke that crosses itself once — the thickened polygon forms a
      // figure-8 with a small triangular overlap at the crossover. Under
      // even-odd fill the crossover is negative space, which becomes a cell.
      linePath(
        'd',
        'shape',
        [
          { x: 50, y: 15 },
          { x: 30, y: 60 },
          { x: 70, y: 90 },
          { x: 30, y: 90 },
          { x: 70, y: 60 }
        ],
        4
      )
    ];

    const topo = computeTopology(doc);
    // Two cells: the region outside the stroke (big) and the loop's interior
    // (small). The loop interior must be strictly smaller than the surrounding
    // region and its centroid must lie in the lower half where the crossover
    // happens.
    expect(topo.cells.length).toBeGreaterThanOrEqual(2);
    const byArea = [...topo.cells].sort((a, b) => a.area - b.area);
    const loopInterior = byArea[0];
    const outside = byArea[byArea.length - 1];
    expect(loopInterior.area).toBeGreaterThan(1);
    expect(loopInterior.area).toBeLessThan(outside.area / 5);
    expect(loopInterior.centroid.y).toBeGreaterThan(60);
    expect(loopInterior.centroid.y).toBeLessThan(100);
  });
});
