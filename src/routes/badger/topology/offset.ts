import type { Vec2 } from '../store/types';
import {
  intersectShapes,
  subtractPolygons,
  subtractShapes,
  unionPolygons,
  type UnionShape
} from './clipping';
import { signedArea } from './geometry';

// Round-join polygon offset built on top of the polygon-clipping engine.
//
// Approach: Minkowski-sum a closed polyline with a disk of radius |amount|,
// then boolean it against the original polygon. The sum is built as the
// union of per-edge rectangles (the straight section of the offset) and
// per-vertex disks (the round join at each corner), which polygon-clipping
// resolves robustly even at acute/reflex corners, self-touching rings, or
// near-tangent edges. Positive amount = grow, negative = shrink.
//
// This replaces the hand-rolled per-vertex half-angle offset that produced
// asymmetric wall thicknesses at concave corners (see the old insetPolygon
// and textExpansion's offsetPolygon) by clamping the miter length to 4×
// instead of actually computing the offset correctly.

// Target circumference density for round joins. 64 segments around a full
// circle keeps each chord within ~0.05% of the true arc radius, small enough
// that cell boundaries hug the rendered stroke silhouette without a visible
// fringe at any practical zoom. Each corner only contributes a fraction of a
// circle (the reflex angle), so the per-corner segment count is smaller.
const ROUND_SEGMENTS = 64;

// One convex piece of the Minkowski sum. A rectangle for each source edge,
// a regular-polygon disk for each source vertex. polygon-clipping unions the
// pieces into the finished offset ring.
function edgeRect(a: Vec2, b: Vec2, radius: number): Vec2[] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const nx = -dy / len;
  const ny = dx / len;
  return [
    { x: a.x + nx * radius, y: a.y + ny * radius },
    { x: b.x + nx * radius, y: b.y + ny * radius },
    { x: b.x - nx * radius, y: b.y - ny * radius },
    { x: a.x - nx * radius, y: a.y - ny * radius }
  ];
}

function vertexDisk(c: Vec2, radius: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i < ROUND_SEGMENTS; i++) {
    const a = (i / ROUND_SEGMENTS) * Math.PI * 2;
    pts.push({ x: c.x + Math.cos(a) * radius, y: c.y + Math.sin(a) * radius });
  }
  return pts;
}

// Minkowski-sum the closed polyline `ring` with a disk of radius `r`. Returns
// the resulting filled region as a set of UnionShapes (one shape per
// component, with holes). For convex rings the result is simply the ring
// inflated outward by r; for concave rings the concavities are rounded
// outward to meet the disk's radius — exactly the behaviour we want for a
// robust "grow" primitive.
function minkowskiOffset(ring: Vec2[], r: number): UnionShape[] {
  if (ring.length < 3 || r <= 0) return [];
  const pieces: UnionShape[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const rect = edgeRect(ring[i], ring[(i + 1) % n], r);
    if (rect) pieces.push({ outer: rect, holes: [] });
    pieces.push({ outer: vertexDisk(ring[i], r), holes: [] });
  }
  return unionPolygons(pieces);
}

// Grow `shape` outward by `amount`. Outer ring moves out, holes shrink (which
// may make them disappear); exposes any new holes created where concave
// corners of the outer ring swallow small holes. The computation runs through
// polygon-clipping, so self-touching or degenerate inputs produce well-formed
// output rather than throwing.
function grow(shape: UnionShape, amount: number): UnionShape[] {
  if (amount <= 0) return [shape];
  // Outer ring inflated = (original solid) ∪ (Minkowski sum of outer ring
  // with disk). We OR the solid with the sum so tiny "pinch" concavities on
  // the ring that don't actually have room for a disk still survive.
  const outerFilled: UnionShape = { outer: shape.outer, holes: [] };
  const outerSum = minkowskiOffset(shape.outer, amount);
  const grownOuter = unionPolygons([outerFilled, ...outerSum]);
  if (grownOuter.length === 0 || shape.holes.length === 0) return grownOuter;
  // Each hole shrinks by `amount`. "Hole shrunk by a" = original hole minus
  // the Minkowski sum of the hole ring with a disk of radius a. If the sum
  // swallows the hole, the hole disappears (subtractPolygons yields an empty
  // difference region).
  for (const hole of shape.holes) {
    const holeShape: UnionShape = { outer: hole, holes: [] };
    const holeSum = minkowskiOffset(hole, amount);
    const shrunk = subtractPolygons([holeShape], holeSum.flatMap((s) => [s.outer]));
    for (const s of shrunk) {
      for (const g of grownOuter) {
        g.holes.push(s.outer);
      }
    }
  }
  return grownOuter;
}

// Shrink `shape` inward by `amount`. Outer ring moves in, holes grow. A
// positive `amount` large enough to collapse the shape yields []. This is
// the exact dual of grow(): shrink(outer) = outer − Minkowski(outer, r).
//
// Minkowski-sum of a closed ring with a disk is an *annular band* straddling
// the ring (outer boundary at R+r, inner boundary at R−r). Subtracting that
// band from the original solid carves a strip of width r off the perimeter,
// which is exactly the shrunk shape. Earlier revisions passed only the
// band's outer boundary as a solid, which — being strictly larger than the
// original — collapsed everything to empty. We pass the full annular shape
// so polygon-clipping sees the band's interior hole and only removes the
// rim, not the core.
function shrink(shape: UnionShape, amount: number): UnionShape[] {
  if (amount <= 0) return [shape];
  const outerShape: UnionShape = { outer: shape.outer, holes: [] };
  const outerSum = minkowskiOffset(shape.outer, amount);
  let shrunk = subtractShapes([outerShape], outerSum);
  if (shrunk.length === 0) return [];
  if (shape.holes.length === 0) return shrunk;
  // Holes grow outward: we remove each hole's grown footprint from the
  // shrunk region. The grown footprint = original hole ∪ Minkowski band
  // around the hole; unioning turns the band-with-hole into a solid disk
  // covering the hole's interior AND its expanded rim, which is what gets
  // subtracted from the enamel-safe region.
  for (const hole of shape.holes) {
    const holeShape: UnionShape = { outer: hole, holes: [] };
    const grown = unionPolygons([holeShape, ...minkowskiOffset(hole, amount)]);
    shrunk = subtractShapes(shrunk, grown);
    if (shrunk.length === 0) return [];
  }
  return shrunk;
}

// Offset a polygon ring by `amount`. Positive grows outward, negative shrinks
// inward. Returns zero or more outer rings; interior detail (holes, multiple
// components) is discarded — callers that need holes use offsetShape instead.
// This is a compatibility shim matching the signature of the old
// insetPolygon / inflatePolygon pair.
export function offsetRing(ring: Vec2[], amount: number): Vec2[][] {
  if (ring.length < 3 || amount === 0) return ring.length >= 3 ? [normalizeCCW(ring)] : [];
  const shape: UnionShape = { outer: normalizeCCW(ring), holes: [] };
  const result = amount > 0 ? grow(shape, amount) : shrink(shape, -amount);
  return result.map((s) => s.outer);
}

// Ring-version of grow/shrink that returns just the first outer ring — the
// common case when the caller knows the shape is connected and has no holes
// (e.g. pre-shape inflate of a cutout buffer). Returns [] if the offset
// collapsed the ring or produced nothing.
export function offsetRingSingle(ring: Vec2[], amount: number): Vec2[] {
  const all = offsetRing(ring, amount);
  return all.length > 0 ? all[0] : [];
}

// Offset a shape-with-holes. Single entry point that downstream pipeline code
// uses when it has UnionShape-typed inputs. Positive grows, negative shrinks.
export function offsetShape(shape: UnionShape, amount: number): UnionShape[] {
  if (amount === 0) return [{ outer: normalizeCCW(shape.outer), holes: shape.holes.map(normalizeCW) }];
  return amount > 0 ? grow(shape, amount) : shrink(shape, -amount);
}

// polygon-clipping always emits CCW outer rings, but ad-hoc input rings may
// come either way. Normalize so Minkowski-sum edge normals point consistently
// outward before we feed the union.
function normalizeCCW(ring: Vec2[]): Vec2[] {
  if (ring.length < 3) return ring;
  return signedArea(ring) >= 0 ? ring : [...ring].reverse();
}

function normalizeCW(ring: Vec2[]): Vec2[] {
  if (ring.length < 3) return ring;
  return signedArea(ring) < 0 ? ring : [...ring].reverse();
}

// Offset each ring of a cell (outer + holes) independently. The cell shrinks
// from all boundaries by `amount` uniformly — the direct equivalent of
// old-code pattern:
//    intersect(cell_outer_inset, subtract(safe_region, grown_holes))
// but expressed as a single operation that can be used by enamel-inset and
// wall-clip flows without repeatedly chaining subtractPolygons.
export function shrinkShapeFromAllBoundaries(
  shape: UnionShape,
  amount: number
): UnionShape[] {
  if (amount <= 0) return [shape];
  // Outer shrink: subtract the Minkowski band (outer ring with its inner
  // hole intact) from the original solid so only the rim strip is removed.
  // See shrink() for why the band's hole matters.
  const outerShape: UnionShape = { outer: shape.outer, holes: [] };
  const outerSum = minkowskiOffset(shape.outer, amount);
  let shrunk = subtractShapes([outerShape], outerSum);
  if (shrunk.length === 0) return [];
  // Hole barriers: original hole ∪ Minkowski band = grown hole footprint.
  // These are simple (no hole) solids by construction, so subtracting via
  // outer rings is correct.
  const holeBarriers: Vec2[][] = [];
  for (const hole of shape.holes) {
    const holeShape: UnionShape = { outer: hole, holes: [] };
    const grownHole = unionPolygons([holeShape, ...minkowskiOffset(hole, amount)]);
    for (const g of grownHole) holeBarriers.push(g.outer);
  }
  if (holeBarriers.length > 0) {
    shrunk = subtractPolygons(shrunk, holeBarriers);
  }
  return shrunk;
}

// Intersect a simple polygon with the offset region of a shape. Used by the
// enamel pipeline: the "safe region" where enamel may sit is the outline
// union shrunk by minWallWidth with cutout barriers grown by minWallWidth
// already subtracted. Rather than assembling that scaffolding at the call
// site, this helper collapses it into one polygon-clipping op.
export function intersectWithShrunkShapes(
  poly: Vec2[],
  shapes: UnionShape[],
  amount: number
): UnionShape[] {
  if (poly.length < 3 || shapes.length === 0) return [];
  const shrunk: UnionShape[] = [];
  for (const s of shapes) {
    for (const g of shrinkShapeFromAllBoundaries(s, amount)) shrunk.push(g);
  }
  if (shrunk.length === 0) return [];
  return intersectShapes([{ outer: normalizeCCW(poly), holes: [] }], shrunk);
}
