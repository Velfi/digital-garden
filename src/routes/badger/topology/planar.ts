import type { BadgeDocument, BadgePath, Cell, CellId, Vec2 } from '../store/types';
import { clipPolygonToOutlines, normalizeClosedRing } from './clipping';
import {
  EPS,
  GRAPH_SNAP_DIST,
  flattenPathTagged,
  isEffectivelyClosed,
  thickenPolylineTagged,
  pointInPolygon,
  polygonCentroid,
  signedArea,
  segSegIntersect,
  vDist
} from './geometry';

// Max deviation of the flattened polyline from the true bezier, in mm. Cells
// are filled as SVG polygons while metal strokes render as real beziers, so
// any mismatch shows up as a visible fringe between the fill and the stroke.
// At extreme zoom (>10000%) the gap is visible even at 0.05 mm, so we go
// down to 0.002 mm — sub-pixel at any practical inspection zoom, at the
// cost of ~5× more flattened samples per curve (the bezier subdivision is
// O(log(1/tol)), not linear, so the hit is much less than the ratio suggests).
const CELL_FLATNESS_MM = 0.002;

export type Topology = {
  cells: Cell[];
  outlineUnion: Vec2[][]; // closed outline polygons (what the badge silhouette is)
  cutouts: Vec2[][]; // closed cutout polygons (holes in the silhouette)
};

type Seg = { a: Vec2; b: Vec2; curved: boolean };

type TaggedPoly = { points: Vec2[]; curved: boolean[] };

// Topology-level kind (distinct from the authored kind on BadgePath). An open
// path is always a divider wall. A closed `cutout` path is a hole. Everything
// else is an outline — i.e. the badge silhouette. Users only author `shape`
// vs `cutout`; the outline/divider split falls out of whether the path is
// closed, so they never have to re-tag a wavy stroke as a divider.
export type TopoKind = 'outline' | 'divider' | 'cutout';
export function effectiveKind(p: BadgePath): TopoKind {
  if (!isEffectivelyClosed(p)) return 'divider';
  if (p.kind === 'cutout') return 'cutout';
  return 'outline';
}

// ---- 1. collect polygon "walls" from all metal paths ----
// `dividerHoles` are negative-space rings produced when a thickened stroke
// self-intersects — the inner loop of a figure-6-style divider, for example.
// They contribute edges to the topology graph (so a face-walk can close a cell
// inside the loop) but don't count as divider territory for the fill check.
export function collectWallPolygons(paths: BadgePath[]): {
  outlines: TaggedPoly[];
  dividers: TaggedPoly[];
  dividerHoles: TaggedPoly[];
  cutouts: TaggedPoly[];
} {
  const outlines: TaggedPoly[] = [];
  const cutouts: TaggedPoly[] = [];
  const rawDividers: TaggedPoly[] = [];
  for (const p of paths) {
    const flat = flattenPathTagged(p, { flatness: CELL_FLATNESS_MM });
    const kind = effectiveKind(p);
    if (kind === 'outline') {
      // A self-intersecting closed outline (bowtie, figure-8) is ambiguous
      // under a "ring" reading but well-defined under non-zero fill. Normalize
      // it into one or more disjoint non-self-intersecting rings so the rest
      // of the pipeline (point-in-polygon tests, THREE.Shape extrusion,
      // divider clipping) sees only clean geometry. Holes that emerge from a
      // self-overlapping outline (opposite-winding lobes) are reinterpreted
      // as cutouts, since they are negative space within the silhouette.
      const normalized = normalizeTaggedRing(flat);
      for (const s of normalized) {
        outlines.push(s.outer);
        for (const h of s.holes) cutouts.push(h);
      }
    } else if (kind === 'cutout') {
      // Same treatment for cutouts: a self-intersecting cutout ring gets
      // split into simple holes. Shapes returned from normalization may have
      // inner holes (positive-space islands), but supporting those would
      // require a fourth topo kind; in practice self-intersecting cutouts
      // just want their overall outline cleaned up, so we drop the inner
      // islands and only keep each shape's outer as a cutout.
      const normalized = normalizeTaggedRing(flat);
      for (const s of normalized) cutouts.push(s.outer);
    } else {
      // divider — thicken the centerline into a closed polygon wall.
      // Clipping to the outline happens below once the full outline union is known.
      const width = Math.max(0.1, p.strokeWidth);
      const thick = thickenPolylineTagged(flat.points, width, flat.curved);
      if (thick.points.length >= 3) rawDividers.push(thick);
    }
  }

  const { solid, holes } = clipDividersToOutlines(rawDividers, outlines);
  return { outlines, dividers: solid, dividerHoles: holes, cutouts };
}

// Split a potentially-self-intersecting closed ring into one or more disjoint
// shapes (each with outer + optional holes), preserving curved-point tags by
// looking up surviving vertices against the source polygon. Intersection
// vertices introduced by the clipper are tagged as non-curved, since they
// originate from the analytic ring crossing and carry no bezier provenance.
function normalizeTaggedRing(
  poly: TaggedPoly
): { outer: TaggedPoly; holes: TaggedPoly[] }[] {
  const shapes = normalizeClosedRing(poly.points);
  if (shapes.length === 0) return [];
  const curvedByKey = new Map<string, boolean>();
  for (let i = 0; i < poly.points.length; i++) {
    curvedByKey.set(coordKey(poly.points[i]), poly.curved[i] ?? false);
  }
  const tag = (pts: Vec2[]): TaggedPoly => ({
    points: pts,
    curved: pts.map((p) => curvedByKey.get(coordKey(p)) ?? false)
  });
  return shapes.map((s) => ({ outer: tag(s.outer), holes: s.holes.map(tag) }));
}

// Scissor each thickened divider polygon so it cannot extend past the badge outline.
// Without this, a divider whose endpoint reaches the outline will cap with a
// perpendicular bump sticking out of the silhouette. Clipping makes the cap
// coincide with the outline edge so wall joins are flush.
//
// When a thickened stroke self-intersects (e.g. an open path that loops back
// through itself), the clipper normalizes it under even-odd fill and can
// return shapes with hole rings. Those hole rings are the *negative* space of
// the metal wall — the loop's inner area — and must be preserved as edges in
// the topology graph (so the face-walk finds a cell there) without being
// treated as divider territory themselves. We surface that split to the
// caller via `solid` (outer wall polygons) vs `holes` (negative-space rings).
function clipDividersToOutlines(
  rawDividers: TaggedPoly[],
  outlines: TaggedPoly[]
): { solid: TaggedPoly[]; holes: TaggedPoly[] } {
  const outlinePoints = outlines.map((o) => o.points);
  const solid: TaggedPoly[] = [];
  const holes: TaggedPoly[] = [];

  // When there are no outlines, we still need to normalize self-intersecting
  // dividers so their internal holes are separated from the solid wall region.
  // Fall back to self-union via the clipper (passing an empty outline set
  // bypasses clipping, so do the union manually instead).
  if (outlines.length === 0 || rawDividers.length === 0) {
    for (const d of rawDividers) solid.push(d);
    return { solid, holes };
  }

  for (const d of rawDividers) {
    const curvedByKey = buildCurvedLookup(d);
    const shapes = clipPolygonToOutlines(d.points, outlinePoints);
    for (const shape of shapes) {
      const outerCurved = shape.outer.map((p) => curvedByKey.get(coordKey(p)) ?? false);
      solid.push({ points: shape.outer, curved: outerCurved });
      for (const h of shape.holes) {
        const holeCurved = h.map((p) => curvedByKey.get(coordKey(p)) ?? false);
        holes.push({ points: h, curved: holeCurved });
      }
    }
  }
  return { solid, holes };
}

// Key points by rounded coordinate so we can recover curved tags for vertices
// that survived the clip. Points introduced at the outline intersection get
// tagged as non-curved (they lie on a straight outline edge, by construction
// of the clipper output, and we have no better information).
function buildCurvedLookup(poly: TaggedPoly): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (let i = 0; i < poly.points.length; i++) {
    map.set(coordKey(poly.points[i]), poly.curved[i] ?? false);
  }
  return map;
}

function coordKey(p: Vec2): string {
  const q = 1 / Math.max(EPS, 1e-6);
  return `${Math.round(p.x * q)},${Math.round(p.y * q)}`;
}

// ---- 2. break polygons into segments ----
// Emits one segment per polygon edge, including the closing edge from the last
// point back to the first. Some input sources (flattenPathTagged on closed
// paths) duplicate the first point at the end, others (polygon-clipping rings)
// don't — both should produce the same set of edges, so we detect a duplicate
// closing vertex and skip the extra wrap-around.
function polygonToSegs(poly: TaggedPoly): Seg[] {
  const segs: Seg[] = [];
  const n = poly.points.length;
  if (n < 2) return segs;
  const firstLastDup = vDist(poly.points[0], poly.points[n - 1]) < EPS;
  const last = firstLastDup ? n - 1 : n;
  for (let i = 0; i < last; i++) {
    const a = poly.points[i];
    const b = poly.points[(i + 1) % n];
    if (vDist(a, b) < EPS) continue;
    // A segment is "curved-sourced" if either endpoint sample came from a
    // bezier. This means interior bezier samples and the transition points
    // into/out of a bezier are all marked; runs of line nodes stay clean.
    const curved = !!(poly.curved[i] || poly.curved[(i + 1) % n]);
    segs.push({ a: { ...a }, b: { ...b }, curved });
  }
  return segs;
}

// ---- 3. split segments at mutual intersections ----
function splitAtIntersections(input: Seg[]): Seg[] {
  // For each segment, collect all split parameters from every other segment.
  const splits: number[][] = input.map(() => [0, 1]);

  for (let i = 0; i < input.length; i++) {
    for (let j = i + 1; j < input.length; j++) {
      const hit = segSegIntersect(input[i].a, input[i].b, input[j].a, input[j].b);
      if (!hit) continue;
      splits[i].push(hit.t);
      splits[j].push(hit.u);
    }
  }

  const out: Seg[] = [];
  for (let i = 0; i < input.length; i++) {
    const s = input[i];
    const ts = Array.from(new Set(splits[i].map((t) => Math.max(0, Math.min(1, t)))))
      .sort((a, b) => a - b);
    for (let k = 0; k < ts.length - 1; k++) {
      const t0 = ts[k];
      const t1 = ts[k + 1];
      if (t1 - t0 < 1e-9) continue;
      const a = { x: s.a.x + t0 * (s.b.x - s.a.x), y: s.a.y + t0 * (s.b.y - s.a.y) };
      const b = { x: s.a.x + t1 * (s.b.x - s.a.x), y: s.a.y + t1 * (s.b.y - s.a.y) };
      if (vDist(a, b) < EPS) continue;
      out.push({ a, b, curved: s.curved });
    }
  }
  return out;
}

// ---- 4. build half-edge graph with snapped vertices ----

type Vertex = { id: number; p: Vec2; outgoing: HalfEdge[]; curved: boolean };
type HalfEdge = {
  id: number;
  origin: Vertex;
  target: Vertex;
  twin: HalfEdge;
  next?: HalfEdge;
  face?: number;
  angle: number;
};

function snapKey(p: Vec2, cell: number): string {
  return `${Math.round(p.x / cell)}:${Math.round(p.y / cell)}`;
}

function buildGraph(segs: Seg[]): { vertices: Vertex[]; halfEdges: HalfEdge[] } {
  const cell = GRAPH_SNAP_DIST;
  const vmap = new Map<string, Vertex>();
  const vertices: Vertex[] = [];

  function getVertex(p: Vec2): Vertex {
    // look in this cell and 8 neighbors for an existing close vertex
    const kx = Math.round(p.x / cell);
    const ky = Math.round(p.y / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const k = `${kx + dx}:${ky + dy}`;
        const existing = vmap.get(k);
        if (existing && vDist(existing.p, p) < GRAPH_SNAP_DIST) return existing;
      }
    }
    const v: Vertex = { id: vertices.length, p: { ...p }, outgoing: [], curved: false };
    vertices.push(v);
    vmap.set(`${kx}:${ky}`, v);
    return v;
  }

  const halfEdges: HalfEdge[] = [];
  const edgeKey = new Set<string>();

  for (const s of segs) {
    const a = getVertex(s.a);
    const b = getVertex(s.b);
    if (a === b) continue;
    if (s.curved) {
      a.curved = true;
      b.curved = true;
    }
    const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
    if (edgeKey.has(key)) continue;
    edgeKey.add(key);

    const dx = b.p.x - a.p.x;
    const dy = b.p.y - a.p.y;
    const ang = Math.atan2(dy, dx);
    const he1: HalfEdge = {
      id: halfEdges.length,
      origin: a,
      target: b,
      angle: ang,
      twin: null as unknown as HalfEdge
    };
    const he2: HalfEdge = {
      id: halfEdges.length + 1,
      origin: b,
      target: a,
      angle: ang >= 0 ? ang - Math.PI : ang + Math.PI,
      twin: he1
    };
    he1.twin = he2;
    halfEdges.push(he1, he2);
    a.outgoing.push(he1);
    b.outgoing.push(he2);
  }

  // Sort outgoing by angle ascending at each vertex
  for (const v of vertices) {
    v.outgoing.sort((a, b) => a.angle - b.angle);
  }

  // `next` rule: at the target vertex of a half-edge, the next half-edge in
  // the face walk is the one whose angle comes just *before* the incoming
  // edge's reverse angle (i.e. the most clockwise turn). This corresponds to
  // walking the boundary of the leftmost face.
  for (const he of halfEdges) {
    const tgt = he.target;
    const incomingAngle = he.angle; // the angle pointing INTO tgt
    // we want the outgoing edge at tgt that is the next CW after incomingAngle
    // i.e. has the largest angle strictly less than incomingAngle (mod 2pi).
    const out = tgt.outgoing;
    if (out.length === 0) continue;
    // find the outgoing whose angle, relative to (incomingAngle - pi), is smallest positive
    const target = incomingAngle + Math.PI; // reverse direction — we came from this angle
    let best: HalfEdge | null = null;
    let bestDelta = Infinity;
    for (const o of out) {
      if (o.twin === he) continue; // would u-turn
      let d = target - o.angle;
      while (d <= EPS) d += Math.PI * 2;
      while (d > Math.PI * 2 + EPS) d -= Math.PI * 2;
      if (d < bestDelta) {
        bestDelta = d;
        best = o;
      }
    }
    if (!best) {
      // dead-end (dangling edge) — walk back along the twin
      best = he.twin;
    }
    he.next = best;
  }

  return { vertices, halfEdges };
}

// ---- 5. extract faces by walking `next` pointers ----
type Face = { halfEdges: HalfEdge[]; polygon: Vec2[]; area: number };

function extractFaces(halfEdges: HalfEdge[]): Face[] {
  const seen = new Set<number>();
  const faces: Face[] = [];
  for (const start of halfEdges) {
    if (seen.has(start.id)) continue;
    const walk: HalfEdge[] = [];
    let cur: HalfEdge | undefined = start;
    let guard = 0;
    while (cur && !seen.has(cur.id) && guard++ < halfEdges.length * 2) {
      seen.add(cur.id);
      walk.push(cur);
      cur = cur.next;
    }
    if (walk.length < 3) continue;
    const polygon = walk.map((h) => h.origin.p);
    const sa = signedArea(polygon);
    faces.push({ halfEdges: walk, polygon, area: sa });
  }
  return faces;
}

// ---- 6. tag inside vs outside using outline union + cutout subtraction ----
function pointInsideBadge(
  p: Vec2,
  outlines: Vec2[][],
  cutouts: Vec2[][]
): boolean {
  if (outlines.length === 0) return false;
  let inside = false;
  for (const o of outlines) {
    if (pointInPolygon(p, o)) {
      inside = true;
      break;
    }
  }
  if (!inside) return false;
  for (const c of cutouts) {
    if (pointInPolygon(p, c)) return false;
  }
  return true;
}

// ---- 7. main entry ----
export function computeTopology(doc: BadgeDocument): Topology {
  const { outlines, dividers, dividerHoles, cutouts } = collectWallPolygons(doc.metal.paths);

  if (outlines.length === 0 && dividers.length === 0) {
    return { cells: [], outlineUnion: [], cutouts: [] };
  }

  // All walls contribute segments. Divider walls already enclose a region, but
  // we only care about their edges for cell extraction. Hole rings from
  // self-intersecting dividers also contribute edges so the face-walk can
  // close a cell inside the loop — but they are NOT passed to `dividerPoints`
  // below, because their interior is the loop's empty space, not metal.
  const allPolys = [...outlines, ...dividers, ...dividerHoles, ...cutouts];
  const rawSegs = allPolys.flatMap((p) => polygonToSegs(p));
  const split = splitAtIntersections(rawSegs);
  const { halfEdges } = buildGraph(split);
  const faces = extractFaces(halfEdges);

  const outlinePoints = outlines.map((o) => o.points);
  const cutoutPoints = cutouts.map((c) => c.points);
  const dividerPoints = dividers.map((d) => d.points);

  // Keep inner (positive-area) faces that lie inside the badge silhouette,
  // and aren't inside a divider (those are the metal wall regions themselves).
  const kept: { polygon: Vec2[]; area: number; centroid: Vec2 }[] = [];
  const debug =
    typeof window !== 'undefined' &&
    (window as unknown as { __badgerDebug?: boolean }).__badgerDebug === true;
  if (debug) {
    console.log('[badger] faces found:', faces.length);
  }
  for (const f of faces) {
    const centroid = polygonCentroid(f.polygon);
    if (f.area <= 0.5) {
      if (debug)
        console.log('[badger] face rejected: area <= 0.5', { area: f.area, centroid, poly: f.polygon });
      continue; // negative/outer face or too small
    }
    if (!pointInsideBadge(centroid, outlinePoints, cutoutPoints)) {
      if (debug)
        console.log('[badger] face rejected: centroid outside badge', { area: f.area, centroid });
      continue;
    }
    // If centroid lies strictly inside any divider polygon, it's "metal" — skip.
    let insideDivider = false;
    for (const d of dividerPoints) {
      if (pointInPolygon(centroid, d)) {
        insideDivider = true;
        break;
      }
    }
    if (insideDivider) {
      if (debug)
        console.log('[badger] face rejected: centroid inside divider', { area: f.area, centroid });
      continue;
    }
    if (debug) console.log('[badger] face kept', { area: f.area, centroid });
    kept.push({ polygon: f.polygon, area: f.area, centroid });
  }

  // Nested-outline holes: when a closed outline sits inside another face, the
  // graph produces two disjoint loops and the face-walk yields two overlapping
  // positive faces. Attach the inner loop as a hole on its immediate container
  // so the ring can be colored independently of the disc it surrounds.
  // "Immediate container" = smallest-area face whose polygon strictly contains
  // this face's centroid (but is not this face itself).
  const holesByIndex: Vec2[][][] = kept.map(() => []);
  for (let i = 0; i < kept.length; i++) {
    let parent = -1;
    let parentArea = Infinity;
    for (let j = 0; j < kept.length; j++) {
      if (i === j) continue;
      if (kept[j].area <= kept[i].area) continue;
      if (!pointInPolygon(kept[i].centroid, kept[j].polygon)) continue;
      if (kept[j].area < parentArea) {
        parent = j;
        parentArea = kept[j].area;
      }
    }
    if (parent >= 0) holesByIndex[parent].push(kept[i].polygon);
  }

  const cells: Cell[] = [];
  const usedIds = new Set<string>();
  for (let i = 0; i < kept.length; i++) {
    const k = kept[i];
    const holes = holesByIndex[i];
    let { centroid, area } = k;
    if (holes.length > 0) {
      // Subtract hole areas so manufacturing checks see the true fillable area.
      for (const h of holes) area -= Math.abs(signedArea(h));
      // The geometric centroid of an annulus can land inside a hole (e.g. a
      // concentric ring centroids at its center). Pick a point we know is on
      // the ring — the midpoint of the outer polygon's first edge — so the
      // stable id doesn't collide with the hole's own cell id.
      if (k.polygon.length >= 2) {
        const a = k.polygon[0];
        const b = k.polygon[1];
        centroid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    }
    const id = stableCellId(centroid, area);
    let uniq = id;
    let n = 1;
    while (usedIds.has(uniq)) uniq = `${id}#${n++}`;
    usedIds.add(uniq);
    cells.push({
      id: uniq,
      polygon: k.polygon,
      holes,
      area,
      centroid,
      neighbors: []
    });
  }

  // Compute neighbors: two cells are neighbors if they share a half-edge twin.
  // Simple O(n²) pass by checking polygon edges.
  computeNeighbors(cells);

  return { cells, outlineUnion: outlinePoints, cutouts: cutoutPoints };
}

function stableCellId(centroid: Vec2, area: number): string {
  const x = Math.round(centroid.x * 10) / 10;
  const y = Math.round(centroid.y * 10) / 10;
  const a = Math.round(area);
  return `c_${x}_${y}_${a}`;
}

function computeNeighbors(cells: Cell[]) {
  const edgeMap = new Map<string, CellId[]>();
  for (const c of cells) {
    for (let i = 0; i < c.polygon.length; i++) {
      const a = c.polygon[i];
      const b = c.polygon[(i + 1) % c.polygon.length];
      const key = edgeKey(a, b);
      const arr = edgeMap.get(key) ?? [];
      arr.push(c.id);
      edgeMap.set(key, arr);
    }
  }
  const neighborSet = new Map<CellId, Set<CellId>>();
  for (const c of cells) neighborSet.set(c.id, new Set());
  for (const ids of edgeMap.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        neighborSet.get(ids[i])!.add(ids[j]);
        neighborSet.get(ids[j])!.add(ids[i]);
      }
    }
  }
  for (const c of cells) c.neighbors = [...(neighborSet.get(c.id) ?? [])];
}

function edgeKey(a: Vec2, b: Vec2): string {
  const cell = GRAPH_SNAP_DIST;
  const k1 = `${Math.round(a.x / cell)}:${Math.round(a.y / cell)}`;
  const k2 = `${Math.round(b.x / cell)}:${Math.round(b.y / cell)}`;
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}
