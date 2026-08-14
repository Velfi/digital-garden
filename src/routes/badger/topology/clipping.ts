import * as polygonClipping from 'polygon-clipping';
import type { MultiPolygon, Ring } from 'polygon-clipping';
import type { Vec2 } from '../store/types';

export type UnionShape = { outer: Vec2[]; holes: Vec2[][] };

// Clip a single polygon (divider wall) against the union of outline polygons.
// Returns zero or more shapes (outer ring + holes) representing the intersection.
// Holes matter when the subject polygon self-intersects: a thickened polyline
// that crosses itself has a negative-space region in the crossover (the loop
// interior), which polygon-clipping normalizes to a hole ring. Callers that
// treat every ring as solid would incorrectly mark that interior as divider.
// Used to "scissor" divider walls so they cannot extend past the badge outline,
// which would otherwise create a bump at wall-to-outline joins.
export function clipPolygonToOutlines(poly: Vec2[], outlines: Vec2[][]): UnionShape[] {
  if (outlines.length === 0 || poly.length < 3) return [{ outer: poly, holes: [] }];
  const subjectMP: MultiPolygon = [[toRing(poly)]];
  const outlineMP: MultiPolygon = outlines.map((o) => [toRing(o)]);
  let result: MultiPolygon;
  try {
    result = polygonClipping.intersection(subjectMP, outlineMP);
  } catch {
    // Clipper can throw on degenerate input — keep the unclipped polygon
    // rather than dropping the wall entirely.
    return [{ outer: poly, holes: [] }];
  }
  return fromMultiPolygon(result);
}

// Intersect a single polygon (no holes) with a set of shapes that may have
// holes. Returns zero or more shapes-with-holes representing the intersection.
// Used to clip an enamel cell to the "safe" region (outline inset with cutouts
// inflated as holes) so enamel can never extend into wall territory regardless
// of how the cell polygon was generated.
export function intersectPolygonWithShapes(poly: Vec2[], shapes: UnionShape[]): UnionShape[] {
  if (poly.length < 3 || shapes.length === 0) return [];
  const subjectMP: MultiPolygon = [[toRing(poly)]];
  const clipMP: MultiPolygon = shapes.map((s) => [
    toRing(s.outer),
    ...s.holes.filter((h) => h.length >= 3).map((h) => toRing(h))
  ]);
  let result: MultiPolygon;
  try {
    result = polygonClipping.intersection(subjectMP, clipMP);
  } catch {
    return [];
  }
  return fromMultiPolygon(result);
}

// Union a set of shapes (each possibly having holes) into one or more
// polygons-with-holes. Used by the 3D builder to merge overlapping wall
// pieces (thickened dividers + outline rim) into a single extrudable shape,
// so smooth-normal shading doesn't reveal the seams where individually-
// extruded walls overlap.
export function unionPolygons(shapes: UnionShape[]): UnionShape[] {
  const valid = shapes.filter((s) => s.outer.length >= 3);
  if (valid.length === 0) return [];
  const mp: MultiPolygon = valid.map((s) => [
    toRing(s.outer),
    ...s.holes.filter((h) => h.length >= 3).map((h) => toRing(h))
  ]);
  let result: MultiPolygon;
  try {
    result = polygonClipping.union(mp);
  } catch {
    return valid;
  }
  return fromMultiPolygon(result);
}

// Normalize a potentially self-intersecting closed ring into zero or more
// disjoint, non-self-intersecting shapes with holes. Driven by
// polygon-clipping's non-zero fill rule: a figure-8 ring where both lobes
// wind the same way becomes two separate shapes; a self-overlapping ring
// with opposing lobes becomes one shape with a hole in the overlap. Used
// at the topology boundary so downstream consumers (point-in-polygon
// checks, THREE.Shape extrusion, ring-inset/offset) never see a ring that
// crosses itself.
export function normalizeClosedRing(ring: Vec2[]): UnionShape[] {
  if (ring.length < 3) return [];
  const mp: MultiPolygon = [[toRing(ring)]];
  let result: MultiPolygon;
  try {
    result = polygonClipping.union(mp);
  } catch {
    // Clipper can throw on degenerate input — fall back to treating the ring
    // as-is. Downstream is more robust to a self-intersecting ring than to a
    // dropped one (the badge becomes invisible).
    return [{ outer: ring, holes: [] }];
  }
  return fromMultiPolygon(result);
}

// Intersect two sets of shapes-with-holes. Used to clip a merged stroke
// ribbon (itself the union of many rectangles/disks from strokeClosedPath)
// against the badge silhouette, so the outline-wall ribbon only covers
// metal — extending past the silhouette would put wall geometry floating
// off the base plate.
export function intersectShapes(a: UnionShape[], b: UnionShape[]): UnionShape[] {
  if (a.length === 0 || b.length === 0) return [];
  const toMP = (shapes: UnionShape[]): MultiPolygon =>
    shapes.map((s) => [
      toRing(s.outer),
      ...s.holes.filter((h) => h.length >= 3).map((h) => toRing(h))
    ]);
  let result: MultiPolygon;
  try {
    result = polygonClipping.intersection(toMP(a), toMP(b));
  } catch {
    return [];
  }
  return fromMultiPolygon(result);
}

// Subtract a set of polygons from a set of shapes. Used to punch cutouts
// through the merged wall/base shape.
export function subtractPolygons(shapes: UnionShape[], holes: Vec2[][]): UnionShape[] {
  if (shapes.length === 0) return [];
  const validHoles = holes.filter((h) => h.length >= 3);
  if (validHoles.length === 0) return shapes;
  const subject: MultiPolygon = shapes.map((s) => [
    toRing(s.outer),
    ...s.holes.filter((h) => h.length >= 3).map((h) => toRing(h))
  ]);
  const holeMP: MultiPolygon = validHoles.map((h) => [toRing(h)]);
  let result: MultiPolygon;
  try {
    result = polygonClipping.difference(subject, holeMP);
  } catch {
    return shapes;
  }
  return fromMultiPolygon(result);
}

// Subtract a set of shapes-with-holes from a set of shapes. Unlike
// subtractPolygons, the subtrahend can carry holes — necessary when the
// thing being removed is itself an annular region (e.g. a Minkowski-sum
// band whose inner boundary bounds the shrunk shape). Passing only the
// band's outer ring would collapse the whole original shape since that
// outer, treated as a solid, contains the entire original.
export function subtractShapes(shapes: UnionShape[], subtrahends: UnionShape[]): UnionShape[] {
  if (shapes.length === 0) return [];
  const validSubs = subtrahends.filter((s) => s.outer.length >= 3);
  if (validSubs.length === 0) return shapes;
  const subject: MultiPolygon = shapes.map((s) => [
    toRing(s.outer),
    ...s.holes.filter((h) => h.length >= 3).map((h) => toRing(h))
  ]);
  const subMP: MultiPolygon = validSubs.map((s) => [
    toRing(s.outer),
    ...s.holes.filter((h) => h.length >= 3).map((h) => toRing(h))
  ]);
  let result: MultiPolygon;
  try {
    result = polygonClipping.difference(subject, subMP);
  } catch {
    return shapes;
  }
  return fromMultiPolygon(result);
}

function fromMultiPolygon(mp: MultiPolygon): UnionShape[] {
  const out: UnionShape[] = [];
  for (const poly of mp) {
    if (poly.length === 0) continue;
    const outer = ringToPoints(poly[0]);
    if (outer.length < 3) continue;
    const holes: Vec2[][] = [];
    for (let i = 1; i < poly.length; i++) {
      const h = ringToPoints(poly[i]);
      if (h.length >= 3) holes.push(h);
    }
    out.push({ outer, holes });
  }
  return out;
}

function toRing(points: Vec2[]): Ring {
  const ring: Ring = points.map((p) => [p.x, p.y]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([first[0], first[1]]);
  }
  return ring;
}

function ringToPoints(ring: Ring): Vec2[] {
  const closed =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const raw = closed ? ring.slice(0, -1) : ring;
  return raw.map(([x, y]) => ({ x, y }));
}
