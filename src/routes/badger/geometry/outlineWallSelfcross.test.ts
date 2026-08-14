// Regression: when a closed outline self-intersects, the 3D wall mesh must
// trace the original stroke (including inner-loop boundaries and centerline
// crossings) rather than the simplified non-zero-fill boundary.
//
// Walls for every non-cutout path — open divider or closed outline — are
// built by stroking the raw centerline at width = p.strokeWidth and clipping
// the result to the silhouette. `strokeClosedPath` emits one rectangle per
// edge + one disk per vertex, which handles self-crossings correctly as
// X-junctions; a bowtie centerline becomes a proper X stroke instead of two
// disjoint lobe walls that pinch at the crossing vertex.

import { describe, it, expect } from 'vitest';
import type { BadgePath, Vec2 } from '../store/types';
import { emptyDocument } from '../store/types';
import { buildBadgeMeshData } from './buildBadgeMeshData';
import { computeTopology } from '../topology/planar';

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

// Does any triangle in the wall pieces cover the 2D footprint point
// (docX, docY)? ExtrudeGeometry takes the 2D shape in the XY plane and
// extrudes along Z, so the wall's footprint lives in each piece's XY plane
// — top/bottom caps project to nonzero XY area while vertical side/bevel
// faces project to a line.
function wallCoversDocPoint(
  pieces: { role: string; positions: Float32Array; indices: Uint32Array }[],
  docX: number,
  docY: number,
  docW: number,
  docH: number
): boolean {
  const worldX = docX - docW / 2;
  const worldY = -(docY - docH / 2);
  for (const piece of pieces) {
    if (piece.role !== 'wall') continue;
    const pos = piece.positions;
    const idx = piece.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const ax = pos[a];
      const ay = pos[a + 1];
      const bx = pos[b];
      const by = pos[b + 1];
      const cx = pos[c];
      const cy = pos[c + 1];
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-6) continue;
      const u = ((by - cy) * (worldX - cx) + (cx - bx) * (worldY - cy)) / den;
      const v = ((cy - ay) * (worldX - cx) + (ax - cx) * (worldY - cy)) / den;
      const w = 1 - u - v;
      if (u >= -1e-6 && v >= -1e-6 && w >= -1e-6) return true;
    }
  }
  return false;
}

function wallTopCapCoversDocPoint(
  pieces: { role: string; positions: Float32Array; indices: Uint32Array }[],
  docX: number,
  docY: number,
  docW: number,
  docH: number,
  zTop: number
): boolean {
  const worldX = docX - docW / 2;
  const worldY = -(docY - docH / 2);
  for (const piece of pieces) {
    if (piece.role !== 'wall') continue;
    const pos = piece.positions;
    const idx = piece.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3;
      const b = idx[t + 1] * 3;
      const c = idx[t + 2] * 3;
      const az = pos[a + 2];
      const bz = pos[b + 2];
      const cz = pos[c + 2];
      if (Math.abs(az - zTop) > 1e-6 || Math.abs(bz - zTop) > 1e-6 || Math.abs(cz - zTop) > 1e-6) {
        continue;
      }
      const ax = pos[a];
      const ay = pos[a + 1];
      const bx = pos[b];
      const by = pos[b + 1];
      const cx = pos[c];
      const cy = pos[c + 1];
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-6) continue;
      const u = ((by - cy) * (worldX - cx) + (cx - bx) * (worldY - cy)) / den;
      const v = ((cy - ay) * (worldX - cx) + (ax - cx) * (worldY - cy)) / den;
      const w = 1 - u - v;
      if (u >= -1e-6 && v >= -1e-6 && w >= -1e-6) return true;
    }
  }
  return false;
}

describe('outline wall — self-intersecting closed outlines', () => {
  it('wall traces every stroke of a self-crossing outline, including inner-loop boundaries', () => {
    // Closed path: a CCW outer square immediately followed by a CW inner
    // square. Under non-zero fill the silhouette is "outer minus inner",
    // i.e. a rectangular frame with a hole in the middle. Metal mode draws
    // both rectangles because the SVG stroke follows the raw centerline.
    // Render mode must do the same — in particular the wall must cover
    // points a hair outside the inner rectangle, where the inner loop's
    // stroke ribbon sits.
    const doc = emptyDocument(200, 200);
    const strokeWidth = 4;
    doc.metal.paths = [
      linePath(
        'frame',
        'shape',
        [
          // outer CCW square
          { x: 20, y: 20 },
          { x: 180, y: 20 },
          { x: 180, y: 180 },
          { x: 20, y: 180 },
          // bridge inward (outer and inner-bridge segments overlap and cancel
          // under non-zero fill, leaving a clean outer-minus-inner silhouette)
          { x: 20, y: 20 },
          // inner CW square
          { x: 60, y: 60 },
          { x: 60, y: 140 },
          { x: 140, y: 140 },
          { x: 140, y: 60 },
          // bridge back
          { x: 60, y: 60 }
        ],
        strokeWidth,
        true
      )
    ];
    const topo = computeTopology(doc);
    // Silhouette should be one shape with a hole (frame).
    expect(topo.outlineUnion.length).toBe(1);
    const data = buildBadgeMeshData(doc, topo.cells, 0xd4a44e, 'polished', 'hard');
    const walls = data.pieces.filter((p) => p.role === 'wall');
    expect(walls.length).toBeGreaterThan(0);

    // Points on the inner-square centerline, in the silhouette (between
    // inner and outer rectangles means OUTSIDE the inner rect). The inner
    // loop's stroke ribbon extends strokeWidth/2 each side of its
    // centerline; the half outside the inner rect falls in the silhouette
    // and must be covered by wall. The old code lost the inner loop from
    // the wall entirely, so these samples all missed.
    const d = strokeWidth / 2 - 0.5;
    const samples: Vec2[] = [
      { x: 100, y: 60 - d }, // just outside inner top edge
      { x: 140 + d, y: 100 }, // just outside inner right edge
      { x: 100, y: 140 + d }, // just outside inner bottom edge
      { x: 60 - d, y: 100 }  // just outside inner left edge
    ];
    for (const s of samples) {
      const covered = wallCoversDocPoint(data.pieces, s.x, s.y, 200, 200);
      expect(covered, `wall should cover inner-loop stroke point (${s.x}, ${s.y})`).toBe(true);
    }
  });

  it('interior closed outline renders at single stroke width, not doubled', () => {
    // An outline that sits entirely inside another silhouette should produce
    // a wall whose half-width equals strokeWidth / 2, matching the SVG
    // preview. Previously, interior outlines were stroked at 2·strokeWidth
    // and clipped to the silhouette: boundary outlines survived as an
    // inward-only ribbon of strokeWidth, but interior outlines had nothing
    // to clip and came out at full 2·strokeWidth — a 2× thickness mismatch
    // between the render and color views.
    const doc = emptyDocument(200, 200);
    const strokeWidth = 4;
    doc.metal.paths = [
      linePath(
        'outer',
        'shape',
        [
          { x: 10, y: 10 },
          { x: 190, y: 10 },
          { x: 190, y: 190 },
          { x: 10, y: 190 }
        ],
        strokeWidth,
        true
      ),
      // Interior square at (80..120, 80..120), far from the outer rectangle.
      linePath(
        'inner',
        'shape',
        [
          { x: 80, y: 80 },
          { x: 120, y: 80 },
          { x: 120, y: 120 },
          { x: 80, y: 120 }
        ],
        strokeWidth,
        true
      )
    ];
    const topo = computeTopology(doc);
    const data = buildBadgeMeshData(doc, topo.cells, 0xd4a44e, 'polished', 'hard');
    const half = strokeWidth / 2;
    // On the top edge of the interior square (y = 80), the stroke extends
    // from y = 80 - half to y = 80 + half. Outside that band there should
    // be no wall (within a small tolerance for the polygon-clipping
    // library's edge fuzz).
    const margin = 0.3;
    expect(
      wallCoversDocPoint(data.pieces, 100, 80, 200, 200),
      'wall should cover centerline point on interior outline'
    ).toBe(true);
    expect(
      wallCoversDocPoint(data.pieces, 100, 80 - half + margin, 200, 200),
      'wall should cover point just inside half-width above interior centerline'
    ).toBe(true);
    expect(
      wallCoversDocPoint(data.pieces, 100, 80 + half - margin, 200, 200),
      'wall should cover point just inside half-width below interior centerline'
    ).toBe(true);
    expect(
      wallCoversDocPoint(data.pieces, 100, 80 - half - margin, 200, 200),
      'wall must NOT extend beyond half-width above interior centerline (old 2× bug)'
    ).toBe(false);
    expect(
      wallCoversDocPoint(data.pieces, 100, 80 + half + margin, 200, 200),
      'wall must NOT extend beyond half-width below interior centerline (old 2× bug)'
    ).toBe(false);
  });

  it('closed wall bevel shrinks the top cap from the hole side too', () => {
    const doc = emptyDocument(200, 200);
    doc.metal.wallHeight = 1.2;
    doc.metal.minWallWidth = 0.2;
    doc.metal.bevelRatio = 0.9;
    doc.metal.paths = [
      linePath(
        'outer',
        'shape',
        [
          { x: 10, y: 10 },
          { x: 190, y: 10 },
          { x: 190, y: 190 },
          { x: 10, y: 190 }
        ],
        4,
        true
      ),
      linePath(
        'ring',
        'shape',
        [
          { x: 80, y: 80 },
          { x: 120, y: 80 },
          { x: 120, y: 120 },
          { x: 80, y: 120 }
        ],
        1.2,
        true
      )
    ];
    const topo = computeTopology(doc);
    const data = buildBadgeMeshData(doc, topo.cells, 0xd4a44e, 'polished', 'hard');

    expect(
      wallTopCapCoversDocPoint(data.pieces, 100, 81.7, 200, 200, doc.metal.wallHeight),
      'top cap should no longer stay flat all the way to the original inner edge'
    ).toBe(false);
  });

  it('wall mesh positions contain no NaN for a self-crossing outline', () => {
    const doc = emptyDocument(200, 200);
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
        4,
        true
      )
    ];
    const topo = computeTopology(doc);
    const data = buildBadgeMeshData(doc, topo.cells, 0xd4a44e, 'polished', 'hard');
    for (const piece of data.pieces) {
      for (let i = 0; i < piece.positions.length; i++) {
        expect(Number.isFinite(piece.positions[i])).toBe(true);
      }
      for (let i = 0; i < piece.normals.length; i++) {
        expect(Number.isFinite(piece.normals[i])).toBe(true);
      }
    }
  });
});
