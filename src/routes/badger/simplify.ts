import type { BadgePath, PathNode, Vec2 } from './store/types';

// Default fit tolerance in mm. A badge is typically ~30mm across with ~0.4mm
// walls; 0.15mm is well below visible/manufacturable resolution but loose
// enough that the fitter gets meaningful reduction on hand-drawn pen strokes.
export const DEFAULT_SIMPLIFY_TOLERANCE_MM = 0.15;

// Samples per curve segment when densifying before fitting. 24 is enough for
// the fitter to see the shape of even fairly curvy cubics without being so
// dense that the error passes are slow.
const SAMPLES_PER_CURVE = 24;

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}
function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}
function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}
function normalize(v: Vec2): Vec2 {
  const l = len(v);
  return l === 0 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
}

function sampleCubic(a: Vec2, c1: Vec2, c2: Vec2, b: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * a.x + w1 * c1.x + w2 * c2.x + w3 * b.x,
    y: w0 * a.y + w1 * c1.y + w2 * c2.y + w3 * b.y
  };
}

function sampleQuad(a: Vec2, c: Vec2, b: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y
  };
}

// Flatten the path to a dense polyline so the fitter has a uniform input.
// Returns { points, endTangent } where endTangent is the unit tangent at the
// last point (used as a hint for the final bezier when the path is open).
function densify(path: BadgePath): { points: Vec2[]; startTangent: Vec2; endTangent: Vec2 } {
  const pts: Vec2[] = [path.start];
  let cur = path.start;
  let startTangent: Vec2 = { x: 0, y: 0 };
  let endTangent: Vec2 = { x: 0, y: 0 };
  let startSet = false;

  for (const n of path.nodes) {
    if (n.type === 'line') {
      pts.push(n.to);
      if (!startSet) {
        startTangent = normalize(sub(n.to, cur));
        startSet = true;
      }
      endTangent = normalize(sub(n.to, cur));
      cur = n.to;
    } else if (n.type === 'quad') {
      for (let i = 1; i <= SAMPLES_PER_CURVE; i++) {
        pts.push(sampleQuad(cur, n.control, n.to, i / SAMPLES_PER_CURVE));
      }
      if (!startSet) {
        startTangent = normalize(sub(n.control, cur));
        if (len(startTangent) === 0) startTangent = normalize(sub(n.to, cur));
        startSet = true;
      }
      endTangent = normalize(sub(n.to, n.control));
      if (len(endTangent) === 0) endTangent = normalize(sub(n.to, cur));
      cur = n.to;
    } else {
      for (let i = 1; i <= SAMPLES_PER_CURVE; i++) {
        pts.push(sampleCubic(cur, n.c1, n.c2, n.to, i / SAMPLES_PER_CURVE));
      }
      if (!startSet) {
        startTangent = normalize(sub(n.c1, cur));
        if (len(startTangent) === 0) startTangent = normalize(sub(n.to, cur));
        startSet = true;
      }
      endTangent = normalize(sub(n.to, n.c2));
      if (len(endTangent) === 0) endTangent = normalize(sub(n.to, cur));
      cur = n.to;
    }
  }
  return { points: pts, startTangent, endTangent };
}

// Chord-length parameterization for a subrange of points [lo, hi].
function chordLengthParams(pts: Vec2[], lo: number, hi: number): number[] {
  const u: number[] = new Array(hi - lo + 1).fill(0);
  for (let i = 1; i <= hi - lo; i++) {
    u[i] = u[i - 1] + len(sub(pts[lo + i], pts[lo + i - 1]));
  }
  const total = u[u.length - 1];
  if (total === 0) {
    for (let i = 0; i < u.length; i++) u[i] = i / Math.max(1, u.length - 1);
  } else {
    for (let i = 0; i < u.length; i++) u[i] /= total;
  }
  return u;
}

// Fit a single cubic bezier through pts[lo..hi] with the given unit tangents
// at each end, via least-squares (Schneider's formulation). Returns the two
// control points; endpoints are pts[lo] and pts[hi].
function fitSingleCubic(
  pts: Vec2[],
  lo: number,
  hi: number,
  u: number[],
  t1: Vec2,
  t2: Vec2
): { c1: Vec2; c2: Vec2 } {
  const a = pts[lo];
  const b = pts[hi];

  // Closed-form Schneider matrix.
  let c00 = 0,
    c01 = 0,
    c11 = 0,
    x0 = 0,
    x1 = 0;
  for (let i = 0; i <= hi - lo; i++) {
    const ti = u[i];
    const u1 = 1 - ti;
    const b1 = 3 * u1 * u1 * ti;
    const b2 = 3 * u1 * ti * ti;
    const a1 = scale(t1, b1);
    const a2 = scale(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);

    const pt = pts[lo + i];
    const rhs = sub(
      pt,
      {
        x: u1 * u1 * u1 * a.x + 3 * u1 * u1 * ti * a.x + 3 * u1 * ti * ti * b.x + ti * ti * ti * b.x,
        y: u1 * u1 * u1 * a.y + 3 * u1 * u1 * ti * a.y + 3 * u1 * ti * ti * b.y + ti * ti * ti * b.y
      }
    );
    x0 += dot(a1, rhs);
    x1 += dot(a2, rhs);
  }

  const det = c00 * c11 - c01 * c01;
  let alpha1 = 0;
  let alpha2 = 0;
  if (Math.abs(det) > 1e-12) {
    alpha1 = (x0 * c11 - x1 * c01) / det;
    alpha2 = (c00 * x1 - c01 * x0) / det;
  }

  // Fallback: if alphas are degenerate (negative or unreasonably small),
  // use a heuristic based on the chord length.
  const segLen = len(sub(b, a));
  if (alpha1 < 1e-6 || alpha2 < 1e-6) {
    alpha1 = alpha2 = segLen / 3;
  }

  return {
    c1: add(a, scale(t1, alpha1)),
    c2: add(b, scale(t2, alpha2))
  };
}

function distSqToCubic(p: Vec2, a: Vec2, c1: Vec2, c2: Vec2, b: Vec2, t: number): number {
  const q = sampleCubic(a, c1, c2, b, t);
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return dx * dx + dy * dy;
}

function maxErrorSq(
  pts: Vec2[],
  lo: number,
  hi: number,
  u: number[],
  c1: Vec2,
  c2: Vec2
): { errSq: number; splitIdx: number } {
  const a = pts[lo];
  const b = pts[hi];
  let maxErr = 0;
  let splitIdx = Math.floor((lo + hi) / 2);
  for (let i = 1; i < hi - lo; i++) {
    const err = distSqToCubic(pts[lo + i], a, c1, c2, b, u[i]);
    if (err > maxErr) {
      maxErr = err;
      splitIdx = lo + i;
    }
  }
  return { errSq: maxErr, splitIdx };
}

// Reproject parameters via one Newton-Raphson step to improve fit before
// splitting. Standard Schneider refinement.
function reparameterize(
  pts: Vec2[],
  lo: number,
  hi: number,
  u: number[],
  c1: Vec2,
  c2: Vec2
): number[] {
  const a = pts[lo];
  const b = pts[hi];
  const out = u.slice();
  for (let i = 1; i < out.length - 1; i++) {
    const t = u[i];
    const q = sampleCubic(a, c1, c2, b, t);
    // Derivative of cubic bezier
    const u1 = 1 - t;
    const dq = {
      x: 3 * u1 * u1 * (c1.x - a.x) + 6 * u1 * t * (c2.x - c1.x) + 3 * t * t * (b.x - c2.x),
      y: 3 * u1 * u1 * (c1.y - a.y) + 6 * u1 * t * (c2.y - c1.y) + 3 * t * t * (b.y - c2.y)
    };
    // Second derivative
    const ddq = {
      x: 6 * u1 * (c2.x - 2 * c1.x + a.x) + 6 * t * (b.x - 2 * c2.x + c1.x),
      y: 6 * u1 * (c2.y - 2 * c1.y + a.y) + 6 * t * (b.y - 2 * c2.y + c1.y)
    };
    const diff = sub(q, pts[lo + i]);
    const num = dot(diff, dq);
    const den = dot(dq, dq) + dot(diff, ddq);
    if (Math.abs(den) > 1e-12) {
      out[i] = t - num / den;
      if (out[i] < 0) out[i] = 0;
      if (out[i] > 1) out[i] = 1;
    }
  }
  return out;
}

type FittedCubic = { a: Vec2; c1: Vec2; c2: Vec2; b: Vec2 };

function fitRecursive(
  pts: Vec2[],
  lo: number,
  hi: number,
  t1: Vec2,
  t2: Vec2,
  tolSq: number,
  out: FittedCubic[]
) {
  if (hi - lo < 1) return;
  // Two-point segment: emit a straight cubic.
  if (hi - lo === 1) {
    const a = pts[lo];
    const b = pts[hi];
    const d = len(sub(b, a)) / 3;
    out.push({
      a,
      c1: add(a, scale(t1, d)),
      c2: add(b, scale(t2, d)),
      b
    });
    return;
  }

  let u = chordLengthParams(pts, lo, hi);
  let { c1, c2 } = fitSingleCubic(pts, lo, hi, u, t1, t2);
  let { errSq, splitIdx } = maxErrorSq(pts, lo, hi, u, c1, c2);

  if (errSq < tolSq) {
    out.push({ a: pts[lo], c1, c2, b: pts[hi] });
    return;
  }

  // One Newton refinement pass if the error is within a reasonable range.
  if (errSq < tolSq * 16) {
    u = reparameterize(pts, lo, hi, u, c1, c2);
    ({ c1, c2 } = fitSingleCubic(pts, lo, hi, u, t1, t2));
    ({ errSq, splitIdx } = maxErrorSq(pts, lo, hi, u, c1, c2));
    if (errSq < tolSq) {
      out.push({ a: pts[lo], c1, c2, b: pts[hi] });
      return;
    }
  }

  // Split at point of worst error. Tangent at the split is the unit vector
  // averaging the two adjacent chord directions.
  const prev = normalize(sub(pts[splitIdx], pts[splitIdx - 1]));
  const next = normalize(sub(pts[splitIdx + 1], pts[splitIdx]));
  const tSplit = normalize(add(prev, next));
  const tSplitRev = scale(tSplit, -1);
  fitRecursive(pts, lo, splitIdx, t1, tSplitRev, tolSq, out);
  fitRecursive(pts, splitIdx, hi, tSplit, t2, tolSq, out);
}

// Drop consecutive duplicate points — the fitter doesn't cope with zero-length
// spans, and closed paths often end at start.
function dedupe(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out;
}

// Fit a sequence of cubic beziers to a path, replacing the original nodes.
// Curves that are already simple (few nodes) may come back unchanged or even
// with more nodes; we only return the new version if it's fewer.
export function simplifyPath(
  path: BadgePath,
  toleranceMm = DEFAULT_SIMPLIFY_TOLERANCE_MM
): BadgePath {
  if (path.nodes.length < 2) return path;

  const { points, startTangent, endTangent } = densify(path);
  const pts = dedupe(points);
  if (pts.length < 2) return path;

  // For closed paths, treat the start tangent as the average of the incoming
  // chord (last->first) and the outgoing chord (first->second). This avoids a
  // visible kink at the seam.
  let t1 = startTangent;
  let t2 = scale(endTangent, -1);
  if (path.closed && pts.length >= 3) {
    const last = pts[pts.length - 1];
    const first = pts[0];
    const second = pts[1];
    const secondLast = pts[pts.length - 2];
    const inTan = normalize(sub(first, last));
    const outTan = normalize(sub(second, first));
    t1 = normalize(add(inTan, outTan));
    const inTanEnd = normalize(sub(last, secondLast));
    const outTanEnd = normalize(sub(first, last));
    const avgEnd = normalize(add(inTanEnd, outTanEnd));
    t2 = scale(avgEnd, -1);
  }
  if (len(t1) === 0) t1 = normalize(sub(pts[1], pts[0]));
  if (len(t2) === 0) t2 = normalize(sub(pts[pts.length - 2], pts[pts.length - 1]));

  const tolSq = toleranceMm * toleranceMm;
  const fitted: FittedCubic[] = [];
  fitRecursive(pts, 0, pts.length - 1, t1, t2, tolSq, fitted);

  if (fitted.length === 0) return path;
  // Don't replace if the fit produces at least as many segments as we started
  // with — simplify should never grow a path.
  if (fitted.length >= path.nodes.length) return path;

  const newNodes: PathNode[] = fitted.map((f) => ({
    type: 'cubic',
    c1: f.c1,
    c2: f.c2,
    to: f.b
  }));

  return { ...path, start: fitted[0].a, nodes: newNodes };
}
