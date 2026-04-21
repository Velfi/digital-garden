import { describe, it, expect } from 'vitest';
import type { BadgeDocument, BadgePath, Vec2 } from '../store/types';
import { computeTopology } from './planar';

// ---- builders ----

function polyPath(
  id: string,
  kind: BadgePath['kind'],
  points: Vec2[],
  closed: boolean,
  strokeWidth = 0
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

function square(minX: number, minY: number, maxX: number, maxY: number): Vec2[] {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY }
  ];
}

function ngon(cx: number, cy: number, r: number, sides: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function makeDoc(paths: BadgePath[], width = 200, height = 200): BadgeDocument {
  return {
    canvas: { width, height },
    metal: { paths, texts: [], baseThickness: 1.6, wallHeight: 1.2, bevelRadius: 0.2, minWallWidth: 1 },
    colorAssignments: {},
    materialAssignments: {},
    palette: [],
    render: { finish: 'gold', metalSurface: 'polished', enamelFinish: 'soft', background: '#000' }
  };
}

// Area of a simple polygon (unsigned).
function area(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s / 2);
}

function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y) {
      const xI = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (p.x < xI) inside = !inside;
    }
  }
  return inside;
}

describe('computeTopology — cell coverage and containment', () => {
  it('single outline produces one cell with no holes', () => {
    const outer = polyPath('outer', 'shape', square(10, 10, 90, 90), true);
    const topo = computeTopology(makeDoc([outer]));

    expect(topo.cells).toHaveLength(1);
    expect(topo.cells[0].holes).toEqual([]);
    expect(topo.cells[0].area).toBeCloseTo(80 * 80, 1);
  });

  it('two disjoint outlines side-by-side produce two cells, neither with holes', () => {
    const left = polyPath('l', 'shape', square(10, 10, 40, 40), true);
    const right = polyPath('r', 'shape', square(60, 10, 90, 40), true);
    const topo = computeTopology(makeDoc([left, right]));

    expect(topo.cells).toHaveLength(2);
    for (const c of topo.cells) {
      expect(c.holes).toEqual([]);
    }
    const areas = topo.cells.map((c) => c.area).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(30 * 30, 1);
    expect(areas[1]).toBeCloseTo(30 * 30, 1);
  });

  it('concentric outlines produce a ring cell (with one hole) and a disc cell', () => {
    const outer = polyPath('outer', 'shape', ngon(100, 100, 40, 64), true);
    const inner = polyPath('inner', 'shape', ngon(100, 100, 15, 48), true);
    const topo = computeTopology(makeDoc([outer, inner]));

    expect(topo.cells).toHaveLength(2);
    // One ring, one disc.
    const byArea = [...topo.cells].sort((a, b) => a.area - b.area);
    const disc = byArea[0];
    const ring = byArea[1];

    expect(disc.holes).toEqual([]);
    expect(ring.holes).toHaveLength(1);

    const outerArea = area(ngon(100, 100, 40, 64));
    const innerArea = area(ngon(100, 100, 15, 48));
    expect(disc.area).toBeCloseTo(innerArea, 0);
    // Ring area = outer − inner.
    expect(ring.area).toBeCloseTo(outerArea - innerArea, 0);
    // The ring's hole should enclose the disc's centroid.
    expect(pointInPoly(disc.centroid, ring.holes[0])).toBe(true);
    // The ring's own centroid must NOT fall inside its hole (otherwise stable
    // id collides with the disc cell).
    expect(pointInPoly(ring.centroid, ring.holes[0])).toBe(false);
    // Cell IDs are distinct.
    expect(ring.id).not.toBe(disc.id);
  });

  it('triple-nested outlines attach each hole to its immediate container only', () => {
    // Three concentric circles: r=40, r=25, r=10. Expect three cells:
    //   outermost ring (r=40 outer, r=25 hole)
    //   middle ring   (r=25 outer, r=10 hole)
    //   inner disc    (r=10)
    const a = polyPath('a', 'shape', ngon(100, 100, 40, 64), true);
    const b = polyPath('b', 'shape', ngon(100, 100, 25, 64), true);
    const c = polyPath('c', 'shape', ngon(100, 100, 10, 48), true);
    const topo = computeTopology(makeDoc([a, b, c]));

    expect(topo.cells).toHaveLength(3);
    const byArea = [...topo.cells].sort((a, b) => a.area - b.area);
    const disc = byArea[0];
    const midRing = byArea[1];
    const outRing = byArea[2];

    expect(disc.holes).toEqual([]);
    expect(midRing.holes).toHaveLength(1);
    expect(outRing.holes).toHaveLength(1);

    // The middle ring's hole should contain the disc; the outer ring's hole
    // should contain the middle ring's wall, NOT the innermost disc directly.
    expect(pointInPoly(disc.centroid, midRing.holes[0])).toBe(true);
    // Outer ring's hole matches the middle outline (r≈25), not the innermost (r≈10).
    const outerHoleArea = area(outRing.holes[0]);
    expect(outerHoleArea).toBeCloseTo(area(ngon(100, 100, 25, 64)), 0);
    expect(outerHoleArea).not.toBeCloseTo(area(ngon(100, 100, 10, 48)), 0);
  });

  it('two inner outlines inside one outer produce two holes on the outer', () => {
    const outer = polyPath('outer', 'shape', square(10, 10, 190, 90), true);
    const innerL = polyPath('iL', 'shape', ngon(50, 50, 15, 48), true);
    const innerR = polyPath('iR', 'shape', ngon(150, 50, 15, 48), true);
    const topo = computeTopology(makeDoc([outer, innerL, innerR]));

    expect(topo.cells).toHaveLength(3);
    const byArea = [...topo.cells].sort((a, b) => a.area - b.area);
    const discL = byArea[0];
    const discR = byArea[1];
    const slab = byArea[2];

    expect(discL.holes).toEqual([]);
    expect(discR.holes).toEqual([]);
    expect(slab.holes).toHaveLength(2);

    // Both disc centroids fall inside exactly one of the slab's holes.
    const centroidsInHoles = [discL.centroid, discR.centroid].map(
      (p) => slab.holes.filter((h) => pointInPoly(p, h)).length
    );
    expect(centroidsInHoles).toEqual([1, 1]);
  });

  it('divider splitting the outer in half with a nested outline only attaches the hole to the half that contains it', () => {
    // Outer rect spans x=10..190, y=10..90. Vertical divider at x=100 splits
    // it into two halves of roughly equal area. Inner circle sits in the LEFT
    // half only, which punches a hole in its cell and makes it smaller than
    // the (still-solid) right half.
    const outer = polyPath('outer', 'shape', square(10, 10, 190, 90), true);
    const divider = polyPath(
      'd',
      'shape',
      [
        { x: 100, y: 10 },
        { x: 100, y: 90 }
      ],
      false,
      2
    );
    const inner = polyPath('inner', 'shape', ngon(50, 50, 12, 48), true);
    const topo = computeTopology(makeDoc([outer, divider, inner]));

    // Expect 3 cells: left half (ring), right half (solid), inner disc.
    expect(topo.cells).toHaveLength(3);

    // Identify cells by position rather than area so the labels are explicit.
    const disc = topo.cells.find((c) => c.area < 1000)!;
    const leftHalf = topo.cells.find((c) => c !== disc && c.centroid.x < 100)!;
    const rightHalf = topo.cells.find((c) => c !== disc && c.centroid.x >= 100)!;

    expect(disc).toBeDefined();
    expect(leftHalf).toBeDefined();
    expect(rightHalf).toBeDefined();

    expect(disc.holes).toEqual([]);
    expect(rightHalf.holes).toEqual([]);
    expect(leftHalf.holes).toHaveLength(1);

    // The hole belongs to the left half — its centroid should sit inside
    // leftHalf.polygon and inside leftHalf's one hole.
    expect(pointInPoly(disc.centroid, leftHalf.polygon)).toBe(true);
    expect(pointInPoly(disc.centroid, leftHalf.holes[0])).toBe(true);
    // And should NOT be inside the right half's polygon.
    expect(pointInPoly(disc.centroid, rightHalf.polygon)).toBe(false);
  });

  it('a cutout inside an outline does not become a cell and does not attach as a cell-hole', () => {
    // Offset the cutout so the outline face's centroid isn't inside the
    // cutout — `pointInsideBadge` would otherwise reject the outline face.
    const outer = polyPath('outer', 'shape', square(10, 10, 90, 90), true);
    const cut = polyPath('cut', 'cutout', ngon(30, 30, 8, 48), true);
    const topo = computeTopology(makeDoc([outer, cut]));

    expect(topo.cells).toHaveLength(1);
    expect(topo.cells[0].holes).toEqual([]);
    expect(topo.cutouts).toHaveLength(1);
  });
});
