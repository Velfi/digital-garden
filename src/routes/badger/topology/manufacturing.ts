import type { BadgeDocument, Cell, Vec2 } from '../store/types';
import { flattenPath, vDist, segSegIntersect } from './geometry';
import { effectiveKind } from './planar';

export type Warning = {
  kind: 'thin-wall' | 'small-cell' | 'self-intersect' | 'no-outline';
  message: string;
  at?: Vec2;
};

export function runChecks(doc: BadgeDocument, cells: Cell[]): Warning[] {
  const w: Warning[] = [];
  const outlines = doc.metal.paths.filter((p) => effectiveKind(p) === 'outline');
  if (outlines.length === 0) {
    w.push({ kind: 'no-outline', message: 'No outline shape yet — draw the badge silhouette.' });
  }
  const minArea = 1; // mm²
  for (const c of cells) {
    if (c.area < minArea) {
      w.push({
        kind: 'small-cell',
        message: `Cell too small to fill reliably (${c.area.toFixed(2)} mm²).`,
        at: c.centroid
      });
    }
  }
  // self-intersection: any path whose own segments cross each other.
  // We tolerate shared endpoints (where two segments legitimately meet at a
  // node) by rejecting intersections that land within ENDPOINT_EPS of any of
  // the four segment endpoints.
  const ENDPOINT_EPS = 0.05; // mm; absorbs anchor-snap quantization
  for (const p of doc.metal.paths) {
    const poly = flattenPath(p);
    if (poly.length < 4) continue;
    const segs: Array<[Vec2, Vec2]> = [];
    for (let i = 0; i < poly.length - 1; i++) segs.push([poly[i], poly[i + 1]]);
    outer: for (let i = 0; i < segs.length; i++) {
      for (let j = i + 2; j < segs.length; j++) {
        // Skip the wraparound segment pair for any path that visits near its
        // start — closed or open. Flattened bezier paths can produce an
        // apparent "crossing" between the first and last segments.
        if (i === 0 && j === segs.length - 1) continue;
        const hit = segSegIntersect(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
        if (!hit) continue;
        if (
          vDist(hit.point, segs[i][0]) < ENDPOINT_EPS ||
          vDist(hit.point, segs[i][1]) < ENDPOINT_EPS ||
          vDist(hit.point, segs[j][0]) < ENDPOINT_EPS ||
          vDist(hit.point, segs[j][1]) < ENDPOINT_EPS
        ) {
          continue;
        }
        w.push({
          kind: 'self-intersect',
          message: 'Path self-intersects.',
          at: hit.point
        });
        break outer;
      }
    }
  }
  // thin walls: divider/outline strokeWidth below min
  for (const p of doc.metal.paths) {
    const kind = effectiveKind(p);
    if (kind !== 'divider' && kind !== 'outline') continue;
    if (p.strokeWidth < doc.metal.minWallWidth) {
      const flat = flattenPath(p);
      const mid = flat[Math.floor(flat.length / 2)] ?? { x: 0, y: 0 };
      w.push({
        kind: 'thin-wall',
        message: `Wall thinner than min (${p.strokeWidth.toFixed(2)} mm < ${doc.metal.minWallWidth.toFixed(2)} mm).`,
        at: mid
      });
    }
  }
  // cells that are too thin (poor aspect ratio)
  for (const c of cells) {
    // crude thinness metric: area / perimeter² — low = thin strip
    let perim = 0;
    for (let i = 0; i < c.polygon.length; i++) {
      const a = c.polygon[i];
      const b = c.polygon[(i + 1) % c.polygon.length];
      perim += vDist(a, b);
    }
    for (const hole of c.holes) {
      for (let i = 0; i < hole.length; i++) {
        const a = hole[i];
        const b = hole[(i + 1) % hole.length];
        perim += vDist(a, b);
      }
    }
    const thickness = perim > 0 ? (4 * Math.PI * c.area) / (perim * perim) : 0;
    if (thickness < 0.05 && c.area > minArea) {
      w.push({
        kind: 'thin-wall',
        message: `Cell is very thin — may not hold enamel.`,
        at: c.centroid
      });
    }
  }
  return w;
}
