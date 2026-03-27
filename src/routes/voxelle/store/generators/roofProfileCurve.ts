/** Control points for {@link sampleRoofProfileCurve}: x = inward from eave (0) toward ridge/center (1), y = relative height (0–1). */
export type RoofProfilePoint = { x: number; y: number };

export const ROOF_PROFILE_CURVE_DEFAULT: RoofProfilePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 }
];

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Sort by x, clamp y, pin endpoints to x=0 and x=1 (pyramid-like domain).
 */
export function normalizeRoofProfilePoints(raw: RoofProfilePoint[]): RoofProfilePoint[] {
  if (raw.length < 2) return ROOF_PROFILE_CURVE_DEFAULT.map((p) => ({ ...p }));
  const s = [...raw]
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x);
  s[0] = { x: 0, y: clamp01(s[0]!.y) };
  s[s.length - 1] = { x: 1, y: clamp01(s[s.length - 1]!.y) };
  return s;
}

/** Piecewise linear height at normalized inward distance t ∈ [0,1]. */
export function sampleRoofProfileCurve(ptsIn: RoofProfilePoint[], t: number): number {
  const pts = normalizeRoofProfilePoints(ptsIn);
  const t0 = clamp01(t);
  if (pts.length < 2) return t0;
  if (t0 <= pts[0]!.x) return pts[0]!.y;
  const last = pts[pts.length - 1]!;
  if (t0 >= last.x) return last.y;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (t0 <= b.x) {
      const dx = b.x - a.x;
      if (dx < 1e-9) return b.y;
      const u = (t0 - a.x) / dx;
      return a.y + u * (b.y - a.y);
    }
  }
  return last.y;
}
