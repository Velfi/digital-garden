// Young–Laplace meniscus profile for soft-enamel pin cells.
//
// Liquid enamel cures while sitting in a metal pocket. Surface tension pulls
// the enamel up the wall; gravity pulls the centre down. At equilibrium the
// surface satisfies the Young–Laplace equation
//
//   z''/(1 + z'²)^(3/2) = z / κ²
//
// where κ = sqrt(γ/(ρg)) is the capillary length, z is height below the rim,
// and the profile is against a vertical wall at x=0 with z(∞)=0 on the flat
// bath far from the wall (Deserno, "The shape of a straight fluid meniscus",
// CMU; standard derivation in Landau & Lifshitz §60). The first integral gives
//
//   x(z) = κ·arccosh(2κ/z) − κ·sqrt(4 − (z/κ)²) + C
//
// with contact-angle boundary condition z'(0) = −cot(θ), yielding the wall dip
//
//   dip₀ = κ·sqrt(2(1 − sin θ)).
//
// For arbitrary 2D cell shapes we apply this 1D profile as a function of
// distance to the nearest wall. For cells narrower than ~2κ the far wall's
// pull overlaps with the near wall's, so we superimpose two profiles
// (from each wall) — small cells dip more in the middle, large cells flatten.
// This captures the visual difference between a tight little detail pocket and
// a broad enamel field on a real pin.
//
// Constants chosen for typical UV-cure polymer enamel on plated metal:
//   γ  ≈ 30 mN/m (surface tension of uncured epoxy/acrylic enamel)
//   ρ  ≈ 1100 kg/m³
//   g  = 9.81 m/s²
//   ⇒ κ ≈ 1.67 mm.
// Contact angle against polished gold/nickel: θ ≈ 30° (mildly wetting).
// These are order-of-magnitude — enamel formulations vary — but they give the
// correct scale-dependent behaviour, which is the whole point.

export const ENAMEL_CAPILLARY_LENGTH_MM = 1.67;
export const ENAMEL_CONTACT_ANGLE_RAD = (30 * Math.PI) / 180;

export interface MeniscusParams {
  capillaryLength: number;
  contactAngle: number;
}

const DEFAULT_PARAMS: MeniscusParams = {
  capillaryLength: ENAMEL_CAPILLARY_LENGTH_MM,
  contactAngle: ENAMEL_CONTACT_ANGLE_RAD
};

function resolveParams(p?: Partial<MeniscusParams>): MeniscusParams {
  if (!p) return DEFAULT_PARAMS;
  return {
    capillaryLength: p.capillaryLength ?? DEFAULT_PARAMS.capillaryLength,
    contactAngle: p.contactAngle ?? DEFAULT_PARAMS.contactAngle
  };
}

export function meniscusDipAtWall(p?: Partial<MeniscusParams>): number {
  const { capillaryLength, contactAngle } = resolveParams(p);
  return capillaryLength * Math.sqrt(2 * (1 - Math.sin(contactAngle)));
}

// x as a function of z using the analytic inverse. z must be in (0, dip₀].
// Returns the horizontal distance from the wall at which the meniscus has
// dipped by z. The constant C is fixed by the boundary condition x(dip₀)=0.
function xOfZ(z: number, kappa: number, dip0: number): number {
  if (z <= 0) return Infinity;
  const u = z / kappa;
  // arccosh(2/u) − sqrt(4 − u²)
  const term = (w: number) => {
    const r = 2 / w;
    return Math.acosh(r) - Math.sqrt(4 - w * w);
  };
  const C = -term(dip0 / kappa);
  return kappa * (term(u) + C);
}

// Dip below the cell rim at horizontal distance d from the wall. Deserno
// parameterises the meniscus with z = height above the flat bath level
// (z(0) = z_max = dip₀ at the wall, z(∞) → 0 far from the wall). The cell
// "rim" in our pin corresponds to the contact line, i.e. the highest point
// of the enamel pool at the wall — so dip-below-rim is (dip₀ − z(d)).
// At d = 0 this is 0 (enamel meets the wall at rim height). Far from the
// wall it approaches dip₀ (the bath level, the lowest point of the pool).
export function meniscusDip1D(d: number, p?: Partial<MeniscusParams>): number {
  const params = resolveParams(p);
  const { capillaryLength: kappa } = params;
  const dip0 = meniscusDipAtWall(params);
  if (d <= 0) return 0;
  // Far field: z(d) ≈ exp(-d/κ) up to a constant; for d ≫ κ the meniscus
  // has fully relaxed to bath level. Cut off at 8κ for a clean asymptote
  // and to avoid log-of-tiny blowups in arccosh near z=0.
  if (d >= 8 * kappa) return dip0;

  let lo = 1e-9 * dip0;
  let hi = dip0;
  // xOfZ(hi) = 0, xOfZ(lo) ≈ +∞. xOfZ is monotone decreasing in z, so we
  // bisect for xOfZ(z) = d.
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    const x = xOfZ(mid, kappa, dip0);
    if (x > d) {
      lo = mid;
    } else {
      hi = mid;
    }
    if (hi - lo < 1e-10) break;
  }
  const z = 0.5 * (lo + hi);
  return dip0 - z;
}

// ---- geometry helpers ----

export type Pt = { readonly x: number; readonly y: number };

// Squared distance from (px,py) to segment ab.
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const len2 = abx * abx + aby * aby || 1;
  let t = (apx * abx + apy * aby) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

// Ray-cast point-in-polygon against a flat edge buffer [ax,ay,bx,by, ...].
function pointInPolygonEdges(x: number, y: number, edges: Float64Array): boolean {
  let inside = false;
  for (let i = 0; i < edges.length; i += 4) {
    const ax = edges[i];
    const ay = edges[i + 1];
    const bx = edges[i + 2];
    const by = edges[i + 3];
    if ((ay > y) !== (by > y)) {
      const xAt = ax + ((y - ay) * (bx - ax)) / (by - ay || 1e-30);
      if (x < xAt) inside = !inside;
    }
  }
  return inside;
}

function ringToEdges(ring: ReadonlyArray<Pt>): Float64Array {
  const n = ring.length;
  const buf = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    buf[i * 4] = a.x;
    buf[i * 4 + 1] = a.y;
    buf[i * 4 + 2] = b.x;
    buf[i * 4 + 3] = b.y;
  }
  return buf;
}

function flattenHoleEdges(holes: ReadonlyArray<ReadonlyArray<Pt>>): Float64Array {
  let total = 0;
  for (const h of holes) total += h.length;
  const buf = new Float64Array(total * 4);
  let off = 0;
  for (const h of holes) {
    const n = h.length;
    for (let i = 0; i < n; i++) {
      const a = h[i];
      const b = h[(i + 1) % n];
      buf[off++] = a.x;
      buf[off++] = a.y;
      buf[off++] = b.x;
      buf[off++] = b.y;
    }
  }
  return buf;
}

function minEdgeDist(px: number, py: number, edges: Float64Array): number {
  let best = Infinity;
  for (let i = 0; i < edges.length; i += 4) {
    const d2 = segDist2(px, py, edges[i], edges[i + 1], edges[i + 2], edges[i + 3]);
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

// Distance from (x,y) to the cell boundary (outer ring and any holes), in mm.
// Returns 0 if the point lies outside the outer ring or inside any hole.
// Inside the cell, returns the minimum Euclidean distance to any boundary
// edge (outer or hole) — this is what the meniscus "sees" as its nearest
// wall, regardless of whether that wall is the outer rim or an inner cutout.
export function distanceToBoundary(
  x: number,
  y: number,
  ring: ReadonlyArray<Pt>,
  holes: ReadonlyArray<ReadonlyArray<Pt>> = []
): number {
  const outerEdges = ringToEdges(ring);
  if (!pointInPolygonEdges(x, y, outerEdges)) return 0;
  const holeEdges = flattenHoleEdges(holes);
  // Inside any hole → outside the cell.
  for (const h of holes) {
    const hEdges = ringToEdges(h);
    if (pointInPolygonEdges(x, y, hEdges)) return 0;
  }
  const dOuter = minEdgeDist(x, y, outerEdges);
  if (holeEdges.length === 0) return dOuter;
  const dHole = minEdgeDist(x, y, holeEdges);
  return Math.min(dOuter, dHole);
}

// Precomputed context for one cell. Shared between the mesh path and the
// texture rasteriser so the edge buffer isn't rebuilt for every sample.
export interface CellMeniscusContext {
  readonly outerEdges: Float64Array;
  readonly holeEdges: Float64Array;
  readonly holeRingEdges: ReadonlyArray<Float64Array>;
  readonly inradius: number; // max distance-to-boundary over sampled interior
  readonly bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

export function cellMeniscusContext(
  ring: ReadonlyArray<Pt>,
  holes: ReadonlyArray<ReadonlyArray<Pt>> = []
): CellMeniscusContext {
  const outerEdges = ringToEdges(ring);
  const holeRingEdges = holes.map((h) => ringToEdges(h));
  const holeEdges = flattenHoleEdges(holes);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  // Inradius estimate: sample a coarse grid inside the bbox, track the max
  // interior distance to any edge. 12×12 is plenty for the profile clamp; the
  // mesh subdivides independently, and the texture doesn't need sub-pixel
  // inradius accuracy.
  const N = 12;
  let inradius = 0;
  for (let iy = 1; iy < N; iy++) {
    const y = minY + ((maxY - minY) * iy) / N;
    for (let ix = 1; ix < N; ix++) {
      const x = minX + ((maxX - minX) * ix) / N;
      if (!pointInPolygonEdges(x, y, outerEdges)) continue;
      let insideHole = false;
      for (const hEdges of holeRingEdges) {
        if (pointInPolygonEdges(x, y, hEdges)) {
          insideHole = true;
          break;
        }
      }
      if (insideHole) continue;
      const dOuter = minEdgeDist(x, y, outerEdges);
      const d =
        holeEdges.length > 0 ? Math.min(dOuter, minEdgeDist(x, y, holeEdges)) : dOuter;
      if (d > inradius) inradius = d;
    }
  }
  if (inradius <= 0) inradius = Math.max(maxX - minX, maxY - minY) * 0.1;
  return { outerEdges, holeEdges, holeRingEdges, inradius, bbox: { minX, minY, maxX, maxY } };
}

// Dip below the cell rim at an interior point, using the linearised 1D
// Young–Laplace solution on a bounded domain. For walls at x=0 and x=L with
// contact lines at height dip₀ above the bath,
//
//   z(x) = dip₀ · cosh((x − L/2)/κ) / cosh(L/(2κ))
//
// and dip(x) = dip₀ − z(x). For a 2D cell we substitute the point's
// distance-to-nearest-wall for x and 2·inradius for L — a round-ish cell
// this is exact by symmetry, an elongated cell it correctly captures the
// dominant dip axis (the narrow one) since the point's nearest wall sits on
// that axis. The formula has the right behaviour in every limit: tiny cell
// (inradius → 0) dips nothing (walls hold the whole surface up); large cell
// (inradius → ∞) recovers the full half-space meniscus; dip is 0 at the
// wall and peaks at the cell's deepest interior point.
//
// Linearisation is appropriate here because dip₀ ≈ κ for typical enamel, so
// the full nonlinear correction would change the shape by a few percent —
// swamped by the fact that real cell shapes are polygonal approximations
// and cure geometry has its own irregularities.
export function meniscusDipAt(
  x: number,
  y: number,
  ctx: CellMeniscusContext,
  p?: Partial<MeniscusParams>
): number {
  if (!pointInPolygonEdges(x, y, ctx.outerEdges)) return 0;
  for (const hEdges of ctx.holeRingEdges) {
    if (pointInPolygonEdges(x, y, hEdges)) return 0;
  }
  const dOuter = minEdgeDist(x, y, ctx.outerEdges);
  const d =
    ctx.holeEdges.length > 0 ? Math.min(dOuter, minEdgeDist(x, y, ctx.holeEdges)) : dOuter;
  const params = resolveParams(p);
  const dip0 = meniscusDipAtWall(params);
  const kappa = params.capillaryLength;
  const R = Math.max(ctx.inradius, 1e-6);
  const arg = (d - R) / kappa;
  const denom = Math.cosh(R / kappa);
  const z = (dip0 * Math.cosh(arg)) / denom;
  return Math.max(0, dip0 - z);
}
