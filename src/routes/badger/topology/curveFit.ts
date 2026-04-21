// Fit a sampled polyline to a chain of cubic Bezier segments (Schneider 1990,
// "An Algorithm for Automatically Fitting Digitized Curves", Graphics Gems I).
// The public entry point `fitPencilStroke` first simplifies the input with
// Ramer-Douglas-Peucker (RDP) — this strips pointer jitter that otherwise
// confuses the tangent estimation at endpoints — then runs Schneider's
// recursive fit: try one Bezier, measure squared error, and if the worst error
// exceeds `tolerance²`, split at the worst point and recurse.
import type { Vec2, PathNode } from '../store/types';

type V = Vec2;

function v(x: number, y: number): V {
  return { x, y };
}
function add(a: V, b: V): V {
  return { x: a.x + b.x, y: a.y + b.y };
}
function sub(a: V, b: V): V {
  return { x: a.x - b.x, y: a.y - b.y };
}
function scale(a: V, s: number): V {
  return { x: a.x * s, y: a.y * s };
}
function dot(a: V, b: V): number {
  return a.x * b.x + a.y * b.y;
}
function len(a: V): number {
  return Math.hypot(a.x, a.y);
}
function norm(a: V): V {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : v(0, 0);
}

// Perpendicular distance from p to the infinite line through a-b.
function perpDist(p: V, a: V, b: V): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-12) return len(sub(p, a));
  const t = dot(sub(p, a), ab) / l2;
  const proj = add(a, scale(ab, t));
  return len(sub(p, proj));
}

// Iterative RDP — recursion would blow the stack on long strokes.
function rdp(points: V[], epsilon: number): V[] {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (hi - lo < 2) continue;
    let maxD = 0;
    let idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDist(points[i], points[lo], points[hi]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > epsilon) {
      keep[idx] = 1;
      stack.push([lo, idx]);
      stack.push([idx, hi]);
    }
  }
  const out: V[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

// Bernstein basis for cubic Bezier.
function b0(u: number): number {
  const m = 1 - u;
  return m * m * m;
}
function b1(u: number): number {
  const m = 1 - u;
  return 3 * u * m * m;
}
function b2(u: number): number {
  const m = 1 - u;
  return 3 * u * u * m;
}
function b3(u: number): number {
  return u * u * u;
}

function bezierAt(p0: V, p1: V, p2: V, p3: V, u: number): V {
  return add(
    add(scale(p0, b0(u)), scale(p1, b1(u))),
    add(scale(p2, b2(u)), scale(p3, b3(u)))
  );
}

// Chord-length parameterization — gives each sample a u in [0,1] proportional
// to its cumulative arc length along the polyline.
function chordLengthParams(pts: V[], first: number, last: number): number[] {
  const n = last - first + 1;
  const u = new Array<number>(n);
  u[0] = 0;
  for (let i = 1; i < n; i++) {
    u[i] = u[i - 1] + len(sub(pts[first + i], pts[first + i - 1]));
  }
  const total = u[n - 1];
  if (total < 1e-12) for (let i = 0; i < n; i++) u[i] = i / (n - 1);
  else for (let i = 0; i < n; i++) u[i] /= total;
  return u;
}

// Newton-Raphson refinement: for each sample, nudge its parameter u toward the
// closest point on the current Bezier estimate. Improves the LSQ fit noticeably
// on curvy strokes.
function reparameterize(
  pts: V[],
  first: number,
  last: number,
  u: number[],
  p0: V,
  p1: V,
  p2: V,
  p3: V
): number[] {
  const n = last - first + 1;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const P = pts[first + i];
    const uu = u[i];
    // Q(u) and first/second derivatives for Newton step.
    const Q = bezierAt(p0, p1, p2, p3, uu);
    // Q'(u) = 3 * [(1-u)²(p1-p0) + 2(1-u)u(p2-p1) + u²(p3-p2)]
    const d1_0 = scale(sub(p1, p0), 3);
    const d1_1 = scale(sub(p2, p1), 3);
    const d1_2 = scale(sub(p3, p2), 3);
    const m = 1 - uu;
    const Q1 = add(add(scale(d1_0, m * m), scale(d1_1, 2 * m * uu)), scale(d1_2, uu * uu));
    // Q''(u) = 6 * [(1-u)(p2 - 2p1 + p0) + u(p3 - 2p2 + p1)]
    const d2_0 = scale(add(sub(p2, scale(p1, 2)), p0), 6);
    const d2_1 = scale(add(sub(p3, scale(p2, 2)), p1), 6);
    const Q2 = add(scale(d2_0, m), scale(d2_1, uu));
    const diff = sub(Q, P);
    const num = dot(diff, Q1);
    const den = dot(Q1, Q1) + dot(diff, Q2);
    out[i] = Math.abs(den) < 1e-12 ? uu : uu - num / den;
  }
  return out;
}

// Least-squares solve for the two inner control points given fixed endpoints
// and tangent directions. See Graphics Gems I, pp. 612-626 for the derivation.
function generateBezier(
  pts: V[],
  first: number,
  last: number,
  u: number[],
  tHat1: V,
  tHat2: V
): [V, V, V, V] {
  const n = last - first + 1;
  const p0 = pts[first];
  const p3 = pts[last];

  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;

  for (let i = 0; i < n; i++) {
    const uu = u[i];
    const a1 = scale(tHat1, b1(uu));
    const a2 = scale(tHat2, b2(uu));
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(
      pts[first + i],
      add(add(scale(p0, b0(uu)), scale(p0, b1(uu))), add(scale(p3, b2(uu)), scale(p3, b3(uu))))
    );
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }

  const det = c00 * c11 - c01 * c01;
  const detA = x0 * c11 - x1 * c01;
  const detB = c00 * x1 - c01 * x0;

  const chord = len(sub(p3, p0));
  // Fall back to the "1/3 chord" heuristic when the linear system is singular
  // (collinear samples, zero-length tangents, etc.).
  let alphaL = Math.abs(det) < 1e-12 ? chord / 3 : detA / det;
  let alphaR = Math.abs(det) < 1e-12 ? chord / 3 : detB / det;
  // Negative alpha would push the control point backwards past the endpoint,
  // which produces a cusp. Clamp to the same heuristic.
  if (alphaL < 1e-6 || alphaR < 1e-6) {
    alphaL = chord / 3;
    alphaR = chord / 3;
  }

  const p1 = add(p0, scale(tHat1, alphaL));
  const p2 = add(p3, scale(tHat2, alphaR));
  return [p0, p1, p2, p3];
}

function maxError(
  pts: V[],
  first: number,
  last: number,
  u: number[],
  p0: V,
  p1: V,
  p2: V,
  p3: V
): { err2: number; splitAt: number } {
  let err2 = 0;
  let splitAt = Math.floor((first + last) / 2);
  for (let i = 1; i < last - first; i++) {
    const Q = bezierAt(p0, p1, p2, p3, u[i]);
    const d2 = dot(sub(Q, pts[first + i]), sub(Q, pts[first + i]));
    if (d2 >= err2) {
      err2 = d2;
      splitAt = first + i;
    }
  }
  return { err2, splitAt };
}

function fitRecursive(
  pts: V[],
  first: number,
  last: number,
  tHat1: V,
  tHat2: V,
  tol2: number,
  out: [V, V, V, V][],
  depth: number
): void {
  const n = last - first + 1;
  // 2 points: can't fit a real curve — emit a straight cubic.
  if (n === 2) {
    const p0 = pts[first];
    const p3 = pts[last];
    const chord = len(sub(p3, p0)) / 3;
    const p1 = add(p0, scale(tHat1, chord));
    const p2 = add(p3, scale(tHat2, chord));
    out.push([p0, p1, p2, p3]);
    return;
  }

  let u = chordLengthParams(pts, first, last);
  let [p0, p1, p2, p3] = generateBezier(pts, first, last, u, tHat1, tHat2);
  let { err2, splitAt } = maxError(pts, first, last, u, p0, p1, p2, p3);

  if (err2 < tol2) {
    out.push([p0, p1, p2, p3]);
    return;
  }

  // Try up to 4 Newton-Raphson reparameterizations before splitting — same
  // iteration count Graphics Gems I uses. Only worth attempting if the error
  // is already in the ballpark (within 4× tolerance); otherwise just split.
  if (err2 < tol2 * 16 && depth < 24) {
    for (let iter = 0; iter < 4; iter++) {
      u = reparameterize(pts, first, last, u, p0, p1, p2, p3);
      [p0, p1, p2, p3] = generateBezier(pts, first, last, u, tHat1, tHat2);
      const m = maxError(pts, first, last, u, p0, p1, p2, p3);
      err2 = m.err2;
      splitAt = m.splitAt;
      if (err2 < tol2) {
        out.push([p0, p1, p2, p3]);
        return;
      }
    }
  }

  // Split at the point of maximum error. Tangent at the split is estimated
  // from the neighboring samples; the two halves use mirrored directions so
  // the joint stays G1-continuous.
  const tCenter = norm(sub(pts[splitAt - 1], pts[splitAt + 1]));
  fitRecursive(pts, first, splitAt, tHat1, tCenter, tol2, out, depth + 1);
  fitRecursive(pts, splitAt, last, scale(tCenter, -1), tHat2, tol2, out, depth + 1);
}

// Strip consecutive duplicate samples — pointer events commonly emit them and
// they break tangent estimation.
function dedupe(pts: V[]): V[] {
  const out: V[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out;
}

export type FitResult = {
  start: V;
  nodes: PathNode[];
};

// Main entry point. `tolerance` is the max allowed distance (world units,
// mm in badger) from any input sample to the fitted curve. Reasonable range
// is 0.1–1 mm; smaller = more anchors, bigger = smoother.
export function fitPencilStroke(rawPoints: V[], tolerance = 0.4): FitResult | null {
  const pts = dedupe(rawPoints);
  if (pts.length < 2) return null;

  // Pre-simplify with RDP at half the fit tolerance so the fitter sees a clean
  // polyline. The fitter will honor the full tolerance against the simplified
  // points.
  const simplified = rdp(pts, tolerance * 0.5);
  if (simplified.length < 2) return null;

  // Two-point stroke: just a line.
  if (simplified.length === 2) {
    return {
      start: { ...simplified[0] },
      nodes: [{ type: 'line', to: { ...simplified[1] } }]
    };
  }

  const tHat1 = norm(sub(simplified[1], simplified[0]));
  const tHat2 = norm(sub(simplified[simplified.length - 2], simplified[simplified.length - 1]));
  const segments: [V, V, V, V][] = [];
  fitRecursive(simplified, 0, simplified.length - 1, tHat1, tHat2, tolerance * tolerance, segments, 0);

  if (segments.length === 0) return null;

  const start = { ...segments[0][0] };
  const nodes: PathNode[] = segments.map(([, c1, c2, p3]) => ({
    type: 'cubic' as const,
    c1: { ...c1 },
    c2: { ...c2 },
    to: { ...p3 }
  }));
  return { start, nodes };
}
