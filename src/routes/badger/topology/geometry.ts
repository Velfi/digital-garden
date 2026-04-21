import type { Vec2, BadgePath, PathNode } from '../store/types';

export const EPS = 1e-6;
export const SNAP_DIST = 0.5; // px — vertices closer than this are merged

export function v(x: number, y: number): Vec2 {
  return { x, y };
}

export function vAdd(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vSub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vScale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function vLen(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function vNorm(a: Vec2): Vec2 {
  const L = vLen(a);
  if (L < EPS) return { x: 0, y: 0 };
  return { x: a.x / L, y: a.y / L };
}

export function vDist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Treat a path as closed if the author set `closed`, OR if its start and end
// anchors coincide within the topology snap tolerance. The second case covers
// hand-drawn loops whose endpoints visually touch but where the `closed` flag
// never got set (e.g. pen-tool paths, or freehand strokes that landed just
// outside the auto-close threshold). All rendering and topology consumers
// route through this so the filled region matches what the eye sees.
export function isEffectivelyClosed(p: BadgePath): boolean {
  if (p.closed) return true;
  const last = p.nodes[p.nodes.length - 1];
  if (!last) return false;
  return vDist(p.start, last.to) < SNAP_DIST;
}

export function vDot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function vCross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function vEq(a: Vec2, b: Vec2, eps = EPS): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

export type FlattenOpts = {
  // Fixed number of samples per bezier segment. Ignored when `flatness` is set.
  steps?: number;
  // Adaptive-subdivision tolerance in document units (mm). A bezier segment
  // is split until no sample is farther than `flatness` from the chord
  // connecting its neighbors — i.e. the polyline approximates the true curve
  // to within this distance. Use for cell-topology work where the polyline
  // must visually coincide with the rendered bezier.
  flatness?: number;
  // Hard cap on recursion depth when subdividing, to stop pathological
  // degenerate controls from running away.
  maxDepth?: number;
};

// Flatten a bezier/line path into a polyline. `steps` (default 16) samples
// each bezier at fixed intervals — fast and good enough for rough previews
// and bounding boxes. Pass `flatness` instead to adaptively subdivide until
// the polyline approximates the true curve within that tolerance.
export function flattenPath(path: BadgePath, stepsOrOpts: number | FlattenOpts = 16): Vec2[] {
  return flattenPathTagged(path, stepsOrOpts).points;
}

// Same as flattenPath, but also returns a parallel boolean array marking
// which output points came from a curved (quad/cubic) source node. A point
// is `true` if it was sampled from the interior of a bezier curve. Endpoints
// shared between a line and a curve are `true` (the curve-side wins), so a
// chain touching any bezier is detectable downstream.
export function flattenPathTagged(
  path: BadgePath,
  stepsOrOpts: number | FlattenOpts = 16
): { points: Vec2[]; curved: boolean[] } {
  const opts: FlattenOpts = typeof stepsOrOpts === 'number' ? { steps: stepsOrOpts } : stepsOrOpts;
  const steps = opts.steps ?? 16;
  const flatness = opts.flatness;
  const maxDepth = opts.maxDepth ?? 16;

  const points: Vec2[] = [{ ...path.start }];
  const curved: boolean[] = [false];
  let prev = path.start;

  function appendAdaptive(sample: (t: number) => Vec2, isFlat: (t0: number, t1: number) => boolean) {
    // Subdivide [0, 1] so each sub-interval is "flat enough", then emit the
    // right-endpoint samples. The start point (t=0) is already in `points`.
    const stack: Array<[number, number, number]> = [[0, 1, 0]];
    while (stack.length) {
      const [t0, t1, depth] = stack.pop()!;
      if (depth < maxDepth && !isFlat(t0, t1)) {
        const tm = 0.5 * (t0 + t1);
        // push right first so left is processed first (preserving order)
        stack.push([tm, t1, depth + 1]);
        stack.push([t0, tm, depth + 1]);
        continue;
      }
      points.push(sample(t1));
      curved.push(true);
    }
  }

  for (const node of path.nodes) {
    if (node.type === 'line') {
      points.push({ ...node.to });
      curved.push(false);
      prev = node.to;
    } else if (node.type === 'quad') {
      curved[curved.length - 1] = true;
      const p0 = prev, p1 = node.control, p2 = node.to;
      if (flatness !== undefined) {
        appendAdaptive(
          (t) => bezierQuad(p0, p1, p2, t),
          (t0, t1) => quadFlatEnough(p0, p1, p2, t0, t1, flatness)
        );
      } else {
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          points.push(bezierQuad(p0, p1, p2, t));
          curved.push(true);
        }
      }
      prev = node.to;
    } else {
      curved[curved.length - 1] = true;
      const p0 = prev, p1 = node.c1, p2 = node.c2, p3 = node.to;
      if (flatness !== undefined) {
        appendAdaptive(
          (t) => bezierCubic(p0, p1, p2, p3, t),
          (t0, t1) => cubicFlatEnough(p0, p1, p2, p3, t0, t1, flatness)
        );
      } else {
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          points.push(bezierCubic(p0, p1, p2, p3, t));
          curved.push(true);
        }
      }
      prev = node.to;
    }
  }
  if (isEffectivelyClosed(path) && points.length > 0) {
    const last = points[points.length - 1];
    const first = points[0];
    if (!vEq(last, first, 0.01)) {
      points.push({ ...first });
      curved.push(curved[0]);
    }
  }
  return { points, curved };
}

// Flatness tests: a sub-interval [t0, t1] is "flat enough" if the midpoint
// sample deviates from the chord between the two endpoint samples by less
// than `tol`. Conservative but cheap — a true flatness bound would need
// higher derivatives, but for enamel-pin curves the midpoint deviation is
// within a constant factor of the true max and saturates to the right count
// of splits very quickly.
function quadFlatEnough(
  p0: Vec2, p1: Vec2, p2: Vec2,
  t0: number, t1: number,
  tol: number
): boolean {
  const a = bezierQuad(p0, p1, p2, t0);
  const b = bezierQuad(p0, p1, p2, t1);
  const m = bezierQuad(p0, p1, p2, 0.5 * (t0 + t1));
  return perpDist(m, a, b) <= tol;
}

function cubicFlatEnough(
  p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2,
  t0: number, t1: number,
  tol: number
): boolean {
  const a = bezierCubic(p0, p1, p2, p3, t0);
  const b = bezierCubic(p0, p1, p2, p3, t1);
  // Two interior samples — catches S-shaped sub-arcs that a single midpoint
  // check would miss (midpoint near the chord while the quarters bow out).
  const m1 = bezierCubic(p0, p1, p2, p3, t0 + 0.25 * (t1 - t0));
  const m2 = bezierCubic(p0, p1, p2, p3, t0 + 0.75 * (t1 - t0));
  return perpDist(m1, a, b) <= tol && perpDist(m2, a, b) <= tol;
}

function perpDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < EPS) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / L;
}

function bezierQuad(p0: Vec2, p1: Vec2, p2: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
  };
}

function bezierCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y
  };
}

// Expand an open polyline (a centerline divider) into a thickened closed
// polygon by offsetting both sides by width/2. Uses miter-ish joins with
// fallback to bevel for sharp angles.
export function thickenPolyline(poly: Vec2[], width: number): Vec2[] {
  return thickenPolylineTagged(poly, width).points;
}

// Thicken with per-point curved tags. The output wraps left forward, round cap
// at the end, right reverse, round cap at the start. Round caps extend the
// thickened polygon forward past each open endpoint by `width/2`, so a
// centerline that ends near the outline will reach it — matching the rendered
// stroke-linecap=round preview. Each interior point maps to one left + one
// right output; cap points adopt the endpoint's curved flag.
export function thickenPolylineTagged(
  poly: Vec2[],
  width: number,
  curved?: boolean[]
): { points: Vec2[]; curved: boolean[] } {
  if (poly.length < 2 || width <= 0) return { points: [], curved: [] };
  const half = width / 2;
  const left: Vec2[] = [];
  const right: Vec2[] = [];

  const normals: Vec2[] = [];
  for (let i = 0; i < poly.length - 1; i++) {
    const d = vNorm(vSub(poly[i + 1], poly[i]));
    normals.push({ x: -d.y, y: d.x });
  }

  for (let i = 0; i < poly.length; i++) {
    let n: Vec2;
    if (i === 0) {
      n = normals[0];
    } else if (i === poly.length - 1) {
      n = normals[normals.length - 1];
    } else {
      const a = normals[i - 1];
      const b = normals[i];
      const sum = { x: a.x + b.x, y: a.y + b.y };
      const L = vLen(sum);
      if (L < EPS) {
        n = a;
      } else {
        // miter length = 1 / (n.dot(avg))
        const avg = vNorm(sum);
        const cos = vDot(a, avg);
        const miter = cos > 0.1 ? 1 / cos : 1;
        n = vScale(avg, Math.min(miter, 4));
      }
    }
    left.push(vAdd(poly[i], vScale(n, half)));
    right.push(vSub(poly[i], vScale(n, half)));
  }

  // ~arc resolution: enough segments that a half-circle feels round at typical
  // stroke widths without flooding the segment graph.
  const CAP_SEGMENTS = 8;
  // Forward tangent at the last point, and backward tangent at the first.
  // Caps bow outward along these tangents.
  const endTangent = vNorm(vSub(poly[poly.length - 1], poly[poly.length - 2]));
  const startTangent = vNorm(vSub(poly[0], poly[1]));
  const endCap = roundCapFan(poly[poly.length - 1], endTangent, half, CAP_SEGMENTS);
  const startCap = roundCapFan(poly[0], startTangent, half, CAP_SEGMENTS);

  // Closed polygon: left forward, end cap, right reverse, start cap
  const points = [...left, ...endCap, ...right.slice().reverse(), ...startCap];

  const tags =
    curved && curved.length === poly.length ? curved.slice() : new Array<boolean>(poly.length).fill(false);
  const endTag = tags[tags.length - 1];
  const startTag = tags[0];
  const curvedOut = [
    ...tags,
    ...endCap.map(() => endTag),
    ...tags.slice().reverse(),
    ...startCap.map(() => startTag)
  ];
  return { points, curved: curvedOut };
}

// Generate interior arc points for a round cap at `center`, bowing outward
// along `tangent` (a unit vector pointing away from the polyline). The polygon
// edge that enters the cap comes from the left-offset side; we sweep CW from
// the left-normal through the tangent to the right-normal. Returns `segments - 1`
// interior points (the two endpoints are already part of the polygon from the
// offset sides).
function roundCapFan(center: Vec2, tangent: Vec2, radius: number, segments: number): Vec2[] {
  if (segments < 2 || radius < EPS) return [];
  // Left normal of the tangent: rotate CCW by 90°.
  const leftNormal = { x: -tangent.y, y: tangent.x };
  const a0 = Math.atan2(leftNormal.y, leftNormal.x);
  // Sweep -π (CW) to land on the right-normal, passing through the tangent
  // direction at the midpoint — that's the point furthest outward past the
  // endpoint, which is what gives us the desired "forward reach."
  const sweep = -Math.PI;
  const pts: Vec2[] = [];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const a = a0 + sweep * t;
    pts.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return pts;
}

// Emit the per-edge rectangles and per-vertex disks that make up a
// stroke-width ribbon around a closed centerline. Returns a set of convex
// pieces that a polygon-clipping union fuses into a proper annular stroke —
// and, critically, a self-crossing centerline produces a stroke with real
// X-junctions at the crossings instead of a pinched figure-of-eight.
// Per-vertex disks give round joins that match the SVG stroke-linejoin=round
// preview used in metal mode.
//
// Returns an array of simple convex polygons (rectangles and regular polygons).
// Callers pass the array to polygon-clipping's union to get the final ribbon.
export function strokeClosedPath(centerline: Vec2[], width: number): Vec2[][] {
  const n = centerline.length;
  if (n < 2 || width <= 0) return [];
  const half = width / 2;
  const pieces: Vec2[][] = [];

  // Left-normal for each edge (i -> i+1), or null for degenerate edges.
  // Cached because each normal participates in both the rectangle for its
  // edge and the disks at both endpoints.
  const edgeNormals: ({ x: number; y: number } | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = centerline[i];
    const b = centerline[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    edgeNormals[i] = L < EPS ? null : { x: -dy / L, y: dx / L };
  }

  // One rectangle per edge. Skip zero-length edges so we don't emit degenerate
  // quads. Outer corners (a±n·half, b±n·half) sit on the true offset circle
  // of radius `half` around endpoints a and b.
  for (let i = 0; i < n; i++) {
    const nrm = edgeNormals[i];
    if (!nrm) continue;
    const a = centerline[i];
    const b = centerline[(i + 1) % n];
    pieces.push([
      { x: a.x + nrm.x * half, y: a.y + nrm.y * half },
      { x: b.x + nrm.x * half, y: b.y + nrm.y * half },
      { x: b.x - nrm.x * half, y: b.y - nrm.y * half },
      { x: a.x - nrm.x * half, y: a.y - nrm.y * half }
    ]);
  }

  // One rounded polygon per vertex so joins read as round rather than mitered.
  // Rectangle corners at a centerline vertex sit at `vertex ± n·half` for the
  // incoming and outgoing edge normals — both exactly on the true offset
  // circle of radius `half`. A plain regular polygon with fixed orientation
  // puts its chords at `half·cos(π/DISK_SEGMENTS)` < half almost everywhere,
  // so rectangle corners poke past the disk's chords and the polygon-clipping
  // union freezes those protrusions as visible notches along the extruded
  // wall silhouette. To fix this we force two vertices of the disk to land
  // exactly on the two rectangle-corner points (both ±n_in and ±n_out, i.e.
  // four anchor points total), then fill the arcs between them with evenly
  // spaced vertices at the same `half` radius. The resulting polygon's
  // silhouette meets both adjacent rectangles flush at the corners, so the
  // union has no protrusions.
  //
  // Target segment count ≈ 12 around the full circle to match the old
  // roundness/union-cost balance; we approximate it per-arc based on the arc's
  // angular span so thin slivers don't get over-tessellated.
  const TARGET_SEGMENTS = 12;
  const TAU = Math.PI * 2;
  const targetStep = TAU / TARGET_SEGMENTS;
  for (let i = 0; i < n; i++) {
    const c = centerline[i];
    const outgoing = edgeNormals[i];
    const incoming = edgeNormals[(i - 1 + n) % n];
    // Four anchor angles: the outer-side corners from both adjacent rectangles
    // (+n_in, +n_out) and the inner-side corners (-n_in, -n_out). For a
    // degenerate edge (collinear repeated vertex) we fall back to a plain
    // regular 12-gon.
    if (!outgoing && !incoming) continue;
    const primary = outgoing ?? incoming!;
    const secondary = incoming ?? outgoing!;
    const aOut = Math.atan2(primary.y, primary.x);
    const aIn = Math.atan2(secondary.y, secondary.x);
    // Build sorted unique anchor angles in [0, TAU). ±primary and ±secondary
    // give four anchors; when incoming==outgoing (straight segment) duplicates
    // collapse and we get just two.
    const anchors = [
      normalizeAngle(aOut),
      normalizeAngle(aOut + Math.PI),
      normalizeAngle(aIn),
      normalizeAngle(aIn + Math.PI)
    ];
    anchors.sort((a, b) => a - b);
    // Deduplicate anchors that are numerically identical (straight-line case).
    // Include a modular check between the last and first entry so anchors
    // straddling the 0/TAU wrap aren't kept as two separate near-identical
    // points.
    const uniq: number[] = [];
    for (const a of anchors) {
      if (uniq.length === 0 || Math.abs(a - uniq[uniq.length - 1]) > EPS) uniq.push(a);
    }
    if (uniq.length > 1 && Math.abs(uniq[0] + TAU - uniq[uniq.length - 1]) < EPS) {
      uniq.pop();
    }
    const disk: Vec2[] = [];
    for (let j = 0; j < uniq.length; j++) {
      const a0 = uniq[j];
      const a1 = j + 1 < uniq.length ? uniq[j + 1] : uniq[0] + TAU;
      const arc = a1 - a0;
      const steps = Math.max(1, Math.round(arc / targetStep));
      for (let k = 0; k < steps; k++) {
        const a = a0 + (arc * k) / steps;
        disk.push({ x: c.x + Math.cos(a) * half, y: c.y + Math.sin(a) * half });
      }
    }
    pieces.push(disk);
  }

  return pieces;
}

function normalizeAngle(a: number): number {
  const TAU = Math.PI * 2;
  let r = a % TAU;
  if (r < 0) r += TAU;
  return r;
}

// Signed area (shoelace). Positive = CCW.
export function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export function polygonArea(poly: Vec2[]): number {
  return Math.abs(signedArea(poly));
}

export function polygonCentroid(poly: Vec2[]): Vec2 {
  if (poly.length === 0) return { x: 0, y: 0 };
  let cx = 0,
    cy = 0,
    a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p0 = poly[i];
    const p1 = poly[(i + 1) % poly.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    a += cross;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }
  a /= 2;
  if (Math.abs(a) < EPS) {
    // degenerate: fall back to vertex average
    const n = poly.length;
    const sx = poly.reduce((s, p) => s + p.x, 0) / n;
    const sy = poly.reduce((s, p) => s + p.y, 0) / n;
    return { x: sx, y: sy };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// Signed distance from point p to the nearest edge of `poly`. Positive when
// p is inside, negative when outside. Used to find the pole of inaccessibility:
// a point inside a (possibly concave) polygon that's maximally far from any
// edge — useful for placing glyphs/labels that must visually sit inside the
// shape even when the centroid wouldn't (e.g. crescents).
function pointToPolygonSignedDist(p: Vec2, poly: Vec2[]): number {
  let minD = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const qx = a.x + t * dx;
    const qy = a.y + t * dy;
    const d = Math.hypot(p.x - qx, p.y - qy);
    if (d < minD) minD = d;
  }
  return pointInPolygon(p, poly) ? minD : -minD;
}

// Find a point guaranteed to be inside `poly` (assumed simple, possibly
// concave), maximizing distance to the nearest edge. Returns the point and
// that distance (radius of the largest inscribed circle centered there).
// Uses a coarse bbox grid search — good enough for glyph placement; not a
// full polylabel implementation.
export function poleOfInaccessibility(poly: Vec2[]): { point: Vec2; radius: number } {
  if (poly.length === 0) return { point: { x: 0, y: 0 }, radius: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const GRID = 32;
  const stepX = (maxX - minX) / GRID;
  const stepY = (maxY - minY) / GRID;
  let best = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  let bestD = -Infinity;
  for (let iy = 0; iy <= GRID; iy++) {
    for (let ix = 0; ix <= GRID; ix++) {
      const p = { x: minX + ix * stepX, y: minY + iy * stepY };
      const d = pointToPolygonSignedDist(p, poly);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  // Fallback: centroid may still lie outside a sliver polygon where no grid
  // sample landed inside. In that case return a vertex — it's on the boundary
  // but at least not arbitrarily far outside.
  if (bestD <= 0) {
    return { point: poly[0], radius: 0 };
  }
  return { point: best, radius: bestD };
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y) {
      const xIntersect = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (p.x < xIntersect) inside = !inside;
    }
  }
  return inside;
}

// Segment-segment intersection. Returns parameter t in AB (0..1) and u in CD
// (0..1), or null when parallel/non-crossing within the open segments.
export function segSegIntersect(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2
): { t: number; u: number; point: Vec2 } | null {
  const r = vSub(b, a);
  const s = vSub(d, c);
  const denom = vCross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const qp = vSub(c, a);
  const t = vCross(qp, s) / denom;
  const u = vCross(qp, r) / denom;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  const tc = Math.max(0, Math.min(1, t));
  return {
    t: tc,
    u: Math.max(0, Math.min(1, u)),
    point: { x: a.x + tc * r.x, y: a.y + tc * r.y }
  };
}

export function boundsOf(polys: Vec2[][]): { min: Vec2; max: Vec2 } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (minX === Infinity) return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

// Chaikin corner-cutting on an open polyline with endpoints pinned. Each
// iteration replaces every interior segment AB with two points at 1/4 and 3/4,
// producing a smoother chain that preserves endpoints exactly. Good for
// smoothing a run of edges between two junction vertices.
export function chaikinOpen(points: Vec2[], iterations = 2): Vec2[] {
  if (points.length < 3 || iterations <= 0) return points.map((p) => ({ ...p }));
  let cur = points;
  for (let it = 0; it < iterations; it++) {
    const next: Vec2[] = [{ ...cur[0] }];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i];
      const b = cur[i + 1];
      next.push({ x: 0.75 * a.x + 0.25 * b.x, y: 0.75 * a.y + 0.25 * b.y });
      next.push({ x: 0.25 * a.x + 0.75 * b.x, y: 0.25 * a.y + 0.75 * b.y });
    }
    next.push({ ...cur[cur.length - 1] });
    cur = next;
  }
  return cur;
}

// ----- path convenience builders used by editor tools ------
export function pathFromPolygon(
  id: string,
  kind: BadgePath['kind'],
  points: Vec2[],
  strokeWidth = 4
): BadgePath {
  if (points.length === 0) {
    return {
      id,
      kind,
      closed: true,
      start: { x: 0, y: 0 },
      nodes: [],
      strokeWidth
    };
  }
  const nodes: PathNode[] = [];
  for (let i = 1; i < points.length; i++) {
    nodes.push({ type: 'line', to: { ...points[i] } });
  }
  return {
    id,
    kind,
    closed: true,
    start: { ...points[0] },
    nodes,
    strokeWidth
  };
}
