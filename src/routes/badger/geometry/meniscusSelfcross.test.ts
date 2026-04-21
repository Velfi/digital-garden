// Lock in that the meniscus profile stays correct on cells derived from
// self-intersecting metal paths. The planar subdivision guarantees every
// cell.polygon is simple (it's a face in a planar graph), and polygon-
// clipping normalizes every closed outline/cutout up front — so the
// meniscus code never sees a self-crossing ring. These tests assert that
// invariant holds end-to-end: cells are simple and dip behaviour matches
// the 1D cosh profile at the expected limits.

import { describe, it, expect } from 'vitest';
import type { BadgePath, Vec2 } from '../store/types';
import { emptyDocument } from '../store/types';
import { computeTopology } from '../topology/planar';
import { segSegIntersect } from '../topology/geometry';
import {
  ENAMEL_CAPILLARY_LENGTH_MM,
  cellMeniscusContext,
  distanceToBoundary,
  meniscusDipAt,
  meniscusDipAtWall
} from './meniscusProfile';

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

// Does `poly` have any non-adjacent edge pair that properly crosses?
// Ignores vertex-at-vertex coincidences to stay tolerant of snap-merges.
function isSimplePolygon(poly: Vec2[]): boolean {
  const n = poly.length;
  const dist = (p: Vec2, q: Vec2) => Math.hypot(p.x - q.x, p.y - q.y);
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = poly[j];
      const d = poly[(j + 1) % n];
      const hit = segSegIntersect(a, b, c, d);
      if (!hit) continue;
      if (
        dist(hit.point, a) < 1e-6 ||
        dist(hit.point, b) < 1e-6 ||
        dist(hit.point, c) < 1e-6 ||
        dist(hit.point, d) < 1e-6
      ) continue;
      return false;
    }
  }
  return true;
}

// Max dip found by scanning a regular grid over the cell's bbox, rejecting
// exterior samples. Independent of the inradius estimator — gives us a
// rasteriser-style read of the profile.
function maxInteriorDip(polygon: Vec2[], holes: Vec2[][]): number {
  const ctx = cellMeniscusContext(polygon, holes);
  let best = 0;
  for (let iy = 0; iy < 60; iy++) {
    const y = ctx.bbox.minY + (ctx.bbox.maxY - ctx.bbox.minY) * (iy / 59);
    for (let ix = 0; ix < 60; ix++) {
      const x = ctx.bbox.minX + (ctx.bbox.maxX - ctx.bbox.minX) * (ix / 59);
      if (distanceToBoundary(x, y, polygon, holes) <= 0) continue;
      const dip = meniscusDipAt(x, y, ctx);
      if (dip > best) best = dip;
    }
  }
  return best;
}

describe('meniscus on cells from self-intersecting paths', () => {
  it('every cell polygon from a bowtie outline is a simple (non-self-crossing) ring', () => {
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
        0,
        true
      )
    ];
    const topo = computeTopology(doc);
    expect(topo.cells.length).toBe(2);
    for (const c of topo.cells) expect(isSimplePolygon(c.polygon)).toBe(true);
  });

  it('bowtie lobes — large-cell limit: dip approaches dip₀ near the centre', () => {
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
        0,
        true
      )
    ];
    const topo = computeTopology(doc);
    const dip0 = meniscusDipAtWall();
    // Each triangular lobe is 16200 mm² — inradius well above κ≈1.67, so
    // the 1D cosh profile flattens to the half-space limit at the centre.
    for (const c of topo.cells) {
      const maxDip = maxInteriorDip(c.polygon, c.holes);
      expect(maxDip).toBeGreaterThan(0.95 * dip0);
      expect(maxDip).toBeLessThanOrEqual(dip0 + 1e-9);
    }
  });

  it('loop interior from a self-crossing divider — dip profile obeys cosh formula', () => {
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
    const loopCell = [...topo.cells].sort((a, b) => a.area - b.area)[0];
    expect(isSimplePolygon(loopCell.polygon)).toBe(true);

    const ctx = cellMeniscusContext(loopCell.polygon, loopCell.holes);
    const dip0 = meniscusDipAtWall();
    const kappa = ENAMEL_CAPILLARY_LENGTH_MM;
    const maxDip = maxInteriorDip(loopCell.polygon, loopCell.holes);

    // Analytic centre dip from the linearised cosh profile:
    // dip_centre = dip₀ · (1 − 1 / cosh(inradius / κ)). At the sampled peak
    // the observed dip must match this within a few percent — any larger
    // drift signals the meniscus is "seeing" a different effective cell
    // (e.g. distance-to-boundary returning 0 inside, inradius way off).
    const expectedCentre = dip0 * (1 - 1 / Math.cosh(ctx.inradius / kappa));
    expect(maxDip).toBeGreaterThan(0.9 * expectedCentre);
    expect(maxDip).toBeLessThan(1.05 * expectedCentre);
  });
});
