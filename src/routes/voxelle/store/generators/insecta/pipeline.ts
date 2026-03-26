import { coordKey, parseCoordKey } from '../../../coordUtils';
import type { FaceNormal } from '../../core';
import type { Voxel } from '../../../voxelMaterial';
import { cloneVoxel } from '../../../voxelMaterial';
import { clampArticulatedLeg2 } from '../articulatedLeg';
import type { ArticulatedLeg2, GenerateInsectaOptions, InsectaSpeciesId } from './types';
import { INSECTA_INITIAL_LEGS } from './insectaInitialLegs';

export const INSECTA_VOXEL_CAP = 10000;

type Vec3 = [number, number, number];

const VALID_SPECIES = new Set<InsectaSpeciesId>([
  'bee',
  'dragonfly',
  'grasshopper',
  'fly',
  'junebug'
]);

function getTangentVectors(normal: FaceNormal): [FaceNormal, FaceNormal] {
  const [nx, ny] = normal;
  if (nx !== 0)
    return [
      [0, 1, 0],
      [0, 0, 1]
    ];
  if (ny !== 0)
    return [
      [1, 0, 0],
      [0, 0, 1]
    ];
  return [
    [1, 0, 0],
    [0, 1, 0]
  ];
}

/** Match piscina: second tangent = head→abdomen axis. */
function forwardSideUp(normal: FaceNormal): { f: Vec3; s: Vec3; u: Vec3 } {
  const [t1, t2] = getTangentVectors(normal);
  return {
    f: [t2[0], t2[1], t2[2]],
    s: [t1[0], t1[1], t1[2]],
    u: [normal[0], normal[1], normal[2]]
  };
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(a: Vec3, t: number): Vec3 {
  return [a[0] * t, a[1] * t, a[2] * t];
}

function len3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]) || 1;
}

function normalize3(a: Vec3): Vec3 {
  const L = len3(a);
  return [a[0] / L, a[1] / L, a[2] / L];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function rotateYawInPlane(f: Vec3, s: Vec3, yawDeg: number): { f: Vec3; s: Vec3 } {
  const rad = (yawDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const si = Math.sin(rad);
  const nf: Vec3 = [f[0] * c + s[0] * si, f[1] * c + s[1] * si, f[2] * c + s[2] * si];
  const ns: Vec3 = [s[0] * c - f[0] * si, s[1] * c - f[1] * si, s[2] * c - f[2] * si];
  return { f: normalize3(nf), s: normalize3(ns) };
}

function roundP(p: Vec3): [number, number, number] {
  return [Math.round(p[0]), Math.round(p[1]), Math.round(p[2])];
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function clampInsectaOptions(o: GenerateInsectaOptions): GenerateInsectaOptions {
  const species = VALID_SPECIES.has(o.species) ? o.species : 'bee';
  const hr = Math.max(1, o.headRatio);
  const tr = Math.max(1, o.thoraxRatio);
  const ar = Math.max(1, o.abdomenRatio);
  return {
    species,
    totalLength: clampInt(o.totalLength, 12, 72),
    headRatio: hr,
    thoraxRatio: tr,
    abdomenRatio: ar,
    bodyHalfWidth: clampInt(o.bodyHalfWidth, 1, 12),
    bodyHalfHeight: clampInt(o.bodyHalfHeight, 1, 10),
    abdomenTaper: clamp01(o.abdomenTaper),
    headShape: clampInt(o.headShape ?? 60, 0, 100),
    anchorOffsetU: clampInt(o.anchorOffsetU, -24, 24),
    anchorOffsetV: clampInt(o.anchorOffsetV, -24, 24),
    bodyYaw: Math.max(-45, Math.min(45, o.bodyYaw)),
    bodyArch: Math.max(-1, Math.min(1, o.bodyArch)),
    legFront: clampArticulatedLeg2(o.legFront ?? INSECTA_INITIAL_LEGS.front),
    legMid: clampArticulatedLeg2(o.legMid ?? INSECTA_INITIAL_LEGS.mid),
    legHind: clampArticulatedLeg2(o.legHind ?? INSECTA_INITIAL_LEGS.hind),
    antennaLength: clampInt(o.antennaLength, 0, 32),
    antennaSpread: Math.max(0, Math.min(45, o.antennaSpread)),
    antennaPitch: Math.max(0, Math.min(80, o.antennaPitch)),
    antennaRoot: clampInt(o.antennaRoot, 0, 12),
    mandibleLength: clampInt(o.mandibleLength, 0, 8),
    mandibleSpread: Math.max(0, Math.min(25, o.mandibleSpread)),
    mandibleForward: clampInt(o.mandibleForward, 0, 6),
    wingShape: clampInt(o.wingShape ?? 85, 0, 100),
    showWingFore: Boolean(o.showWingFore),
    wingForeLength: clampInt(o.wingForeLength, 0, 40),
    wingForeWidth: clampInt(o.wingForeWidth, 0, 12),
    wingForeSpread: Math.max(0, Math.min(90, o.wingForeSpread)),
    wingForeForwardCant: Math.max(0, Math.min(35, o.wingForeForwardCant ?? 0)),
    wingForePitch: Math.max(0, Math.min(45, o.wingForePitch)),
    wingForeOffset: clampInt(o.wingForeOffset, -8, 8),
    showWingHind: Boolean(o.showWingHind),
    wingHindLength: clampInt(o.wingHindLength, 0, 40),
    wingHindWidth: clampInt(o.wingHindWidth, 0, 12),
    wingHindSpread: Math.max(0, Math.min(90, o.wingHindSpread)),
    wingHindPitch: Math.max(0, Math.min(45, o.wingHindPitch)),
    wingHindOffset: clampInt(o.wingHindOffset, -8, 8)
  };
}

function tryAdd(set: Set<string>, x: number, y: number, z: number, cap: number): boolean {
  if (set.size >= cap) return false;
  set.add(coordKey(x, y, z));
  return true;
}

/** Move every voxel along +u so min(p·u) ≥ place·u — keeps the insect in the air cell from getAddPositionFromHit. */
function shiftInsectaKeysAlongOutwardNormal(set: Set<string>, place: Vec3, u: Vec3): number {
  let minDot = Infinity;
  for (const k of set) {
    const p = parseCoordKey(k) as [number, number, number];
    const d = p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
    if (d < minDot) minDot = d;
  }
  if (!Number.isFinite(minDot)) return 0;
  const placeDot = place[0] * u[0] + place[1] * u[1] + place[2] * u[2];
  const delta = Math.round(placeDot - minDot);
  if (delta <= 0) return 0;
  const next = new Set<string>();
  for (const k of set) {
    const p = parseCoordKey(k) as [number, number, number];
    next.add(coordKey(p[0] + u[0] * delta, p[1] + u[1] * delta, p[2] + u[2] * delta));
  }
  set.clear();
  for (const k of next) set.add(k);
  return delta;
}

function segmentRadii(
  distFromHead: number,
  headLen: number,
  thoraxLen: number,
  abdomenLen: number,
  baseW: number,
  baseH: number,
  taper: number,
  headShape01: number
): { w: number; h: number } {
  if (distFromHead < headLen) {
    const t = distFromHead / Math.max(1, headLen - 1);
    const u = clamp01(t);
    const k = clamp01(headShape01);
    /* Low k: wide snout, gentle width change (blocky / housefly). High k: pinched nose, cheek bulge
     * (triangular / heart / bee). */
    const noseSq = 0.78 + 0.2 * u;
    const crownSq = 1 + 0.05 * Math.sin(Math.PI * u);
    const wSq = noseSq * crownSq * (0.92 + 0.08 * u);
    const hSq = noseSq * crownSq * (0.95 + 0.1 * u);

    const nosePt = 0.48 + 0.52 * Math.sin((Math.PI / 2) * u);
    const crownPt = 1 + 0.16 * Math.sin(Math.PI * u);
    const wPt = nosePt * (0.88 + 0.12 * u) * crownPt;
    const hPt = Math.max(0.92, nosePt * 1.08) * crownPt * (1.04 + 0.1 * Math.sin(Math.PI * u));

    const wScale = wSq * (1 - k) + wPt * k;
    const hScale = hSq * (1 - k) + hPt * k;
    return {
      w: Math.max(1, Math.round(baseW * wScale)),
      h: Math.max(1, Math.round(baseH * hScale))
    };
  }
  if (distFromHead < headLen + thoraxLen) {
    const ti = distFromHead - headLen;
    const thoraxT = thoraxLen > 1 ? ti / (thoraxLen - 1) : 0;
    /* Thorax bulges mid-segment; last slice pinches (petiole) so abdomen reads separate. */
    const thoraxBulge = 1.04 + 0.12 * Math.sin(Math.PI * thoraxT);
    const atWaist = ti === thoraxLen - 1;
    const waist = atWaist ? 0.78 : 1;
    return {
      w: Math.max(1, Math.round(baseW * thoraxBulge * waist)),
      h: Math.max(1, Math.round(baseH * thoraxBulge * Math.min(1, waist + 0.04)))
    };
  }
  const ab = distFromHead - headLen - thoraxLen;
  const ta = ab / Math.max(1, abdomenLen - 1);
  const tip = 1 - taper * ta * ta;
  /* Wider band early in abdomen (post-waist), then taper to stinger — reads as segments vs thorax. */
  const band = Math.sin(Math.PI * Math.min(1, ta * 2.4));
  const abdomenWide = 1 + 0.18 * band * (1 - ta * 0.65);
  const scale = Math.max(0.36, tip * abdomenWide);
  return {
    w: Math.max(1, Math.round(baseW * scale)),
    h: Math.max(1, Math.round(baseH * Math.max(0.36, scale * 0.96)))
  };
}

function fillSlice(
  set: Set<string>,
  center: Vec3,
  s: Vec3,
  u: Vec3,
  w: number,
  h: number,
  cap: number
): void {
  const cx = Math.round(center[0]);
  const cy = Math.round(center[1]);
  const cz = Math.round(center[2]);
  for (let ds = -w; ds <= w; ds++) {
    for (let du = -h; du <= h; du++) {
      if (set.size >= cap) return;
      const wx = cx + Math.round(s[0] * ds + u[0] * du);
      const wy = cy + Math.round(s[1] * ds + u[1] * du);
      const wz = cz + Math.round(s[2] * ds + u[2] * du);
      set.add(coordKey(wx, wy, wz));
    }
  }
}

/** Step along a world-space direction. Optional rib = second voxel
 * offset along ±s for a thicker femur. Returns the float end point for chaining segments. */
function walkDirectedLeg(
  set: Set<string>,
  start: Vec3,
  s: Vec3,
  u: Vec3,
  dir: Vec3,
  length: number,
  cap: number,
  sideSign: number,
  rib: boolean
): Vec3 {
  if (length <= 0) return start;
  const d = normalize3(dir);
  for (let i = 1; i <= length && set.size < cap; i++) {
    const p = add3(start, scale3(d, i));
    const [x, y, z] = roundP(p);
    tryAdd(set, x, y, z, cap);
    if (rib && set.size < cap) {
      const q = add3(p, scale3(s, sideSign));
      const [qx, qy, qz] = roundP(q);
      tryAdd(set, qx, qy, qz, cap);
    }
  }
  return add3(start, scale3(d, length));
}

function frameOffsetToWorld(
  f: Vec3,
  s: Vec3,
  u: Vec3,
  off: readonly [number, number, number],
  sideSign: number
): Vec3 {
  return add3(add3(scale3(f, off[0]), scale3(s, off[1] * sideSign)), scale3(u, off[2]));
}

/** Final chain tip (float) per mirrored leg; used to equalize ground contact after rest shift. */
function attachArticulatedLegPair(
  set: Set<string>,
  thoraxCenter: Vec3,
  f: Vec3,
  s: Vec3,
  u: Vec3,
  leg: ArticulatedLeg2,
  cap: number
): [Vec3, Vec3] | null {
  if (!leg.enabled || set.size >= cap) return null;
  const hip = add3(thoraxCenter, add3(scale3(f, leg.hipU), scale3(s, leg.hipV)));
  const ends: Vec3[] = [];
  for (const sideSign of [1, -1] as const) {
    const wKnee = frameOffsetToWorld(f, s, u, leg.knee, sideSign);
    const wFoot = frameOffsetToWorld(f, s, u, leg.foot, sideSign);
    let cursor = hip;
    const nk = Math.max(0, Math.round(len3(wKnee)));
    if (nk >= 1) {
      const d1 = normalize3(wKnee);
      cursor = walkDirectedLeg(set, cursor, s, u, d1, nk, cap, sideSign, leg.femurRib ?? false);
    }
    const nf = Math.max(0, Math.round(len3(wFoot)));
    if (nf >= 1) {
      const d2 = normalize3(wFoot);
      cursor = walkDirectedLeg(set, cursor, s, u, d2, nf, cap, sideSign, false);
    }
    if (leg.tarsus) {
      const wTar = frameOffsetToWorld(f, s, u, leg.tarsus, sideSign);
      const nt = Math.max(0, Math.round(len3(wTar)));
      if (nt >= 1) {
        const d3 = normalize3(wTar);
        cursor = walkDirectedLeg(set, cursor, s, u, d3, nt, cap, sideSign, false);
      }
    }
    ends.push(cursor);
  }
  return [ends[0]!, ends[1]!];
}

function walkAntenna(
  set: Set<string>,
  root: Vec3,
  f: Vec3,
  s: Vec3,
  u: Vec3,
  length: number,
  spreadDeg: number,
  pitchDeg: number,
  sideSign: number,
  cap: number
): void {
  if (length <= 0) return;
  /* Like wings: do not fold sideSign into the spread angle (that made s almost cancel vs f/u).
   * Unsigned spread for outward tilt; sideSign picks ±s only. Stronger lateral weight so voxels
   * separate at small spread values after rounding. */
  const spreadRad = (spreadDeg * Math.PI) / 180;
  const pr = (pitchDeg * Math.PI) / 180;
  const dir = normalize3(
    add3(
      add3(scale3(f, -Math.cos(pr)), scale3(u, Math.sin(pr))),
      scale3(s, Math.sin(spreadRad) * sideSign * 0.92)
    )
  );
  for (let i = 0; i <= length && set.size < cap; i++) {
    const p = add3(root, scale3(dir, i));
    const [x, y, z] = roundP(p);
    tryAdd(set, x, y, z, cap);
  }
}

function walkMandible(
  set: Set<string>,
  root: Vec3,
  f: Vec3,
  s: Vec3,
  mandibleLen: number,
  lateral: number,
  sideSign: number,
  cap: number
): void {
  const start = add3(root, scale3(s, lateral * sideSign));
  const dir = normalize3(add3(scale3(f, -1), scale3(s, 0.08 * sideSign)));
  for (let i = 0; i <= mandibleLen && set.size < cap; i++) {
    const p = add3(start, scale3(dir, i));
    const [x, y, z] = roundP(p);
    tryAdd(set, x, y, z, cap);
  }
}

function addWingSheet(
  set: Set<string>,
  attach: Vec3,
  f: Vec3,
  s: Vec3,
  u: Vec3,
  len: number,
  width: number,
  spreadDeg: number,
  pitchDeg: number,
  cap: number,
  sideSign: number,
  wingShape01: number,
  forwardCantDeg: number
): void {
  if (len <= 0 || width < 0) return;
  const shape = clamp01(wingShape01);
  /* Spread tilts the sheet from lateral (0°) toward +f (abdomen/tail). Do NOT fold sideSign into
   * the angle — that flipped one wing along −f and the other along +f (tiny opposing stubs). */
  const sr = (spreadDeg * Math.PI) / 180;
  let wf = normalize3(add3(scale3(f, Math.sin(sr)), scale3(s, Math.cos(sr) * sideSign)));
  /* Extra rotation in the tangent plane toward −f (head): dragonfly-like leading-edge sweep. */
  if (forwardCantDeg > 0) {
    const cr = (forwardCantDeg * Math.PI) / 180;
    wf = normalize3(add3(scale3(wf, Math.cos(cr)), scale3(f, -Math.sin(cr))));
  }
  const wp = normalize3(cross3(u, wf));
  const pr = (pitchDeg * Math.PI) / 180;
  const denom = len > 1 ? len - 1 : 1;
  for (let i = 0; i < len && set.size < cap; i++) {
    const lift = Math.round(Math.tan(pr) * i * 0.35);
    const t = i / denom;
    const elliptical = Math.sqrt(Math.max(0, 1 - t * t));
    const m = 1 + (elliptical - 1) * shape;
    const jMax = Math.round(width * m);
    for (let j = -jMax; j <= jMax && set.size < cap; j++) {
      const base = add3(attach, add3(scale3(wf, i), scale3(wp, j)));
      const [x, y, z] = roundP(add3(base, scale3(u, lift)));
      tryAdd(set, x, y, z, cap);
    }
  }
}

function collectInsectaPositionKeys(
  place: [number, number, number],
  normal: FaceNormal,
  raw: GenerateInsectaOptions
): Set<string> {
  const o = clampInsectaOptions(raw);
  const cap = INSECTA_VOXEL_CAP;
  const set = new Set<string>();

  const sumR = o.headRatio + o.thoraxRatio + o.abdomenRatio;
  const L = o.totalLength;
  const headLen = Math.max(2, Math.round((L * o.headRatio) / sumR));
  const thoraxLen = Math.max(2, Math.round((L * o.thoraxRatio) / sumR));
  const abdomenLen = Math.max(2, L - headLen - thoraxLen);

  const fsu = forwardSideUp(normal);
  let { f, s } = fsu;
  const u = fsu.u;
  ({ f, s } = rotateYawInPlane(f, s, o.bodyYaw));

  const anchor = add3(
    [place[0], place[1], place[2]],
    add3(scale3(f, o.anchorOffsetU), scale3(s, o.anchorOffsetV))
  );

  const thoraxCenter = anchor;
  const headFront = add3(thoraxCenter, scale3(f, -(thoraxLen / 2 + headLen)));
  const totalSteps = headLen + thoraxLen + abdomenLen;
  const headShape01 = o.headShape / 100;

  /* Integer steps along f (not i+0.5). Half-step centers + per-slice Math.round made
   * round(M-0.5) and round(M+0.5) skip layer M when headFront·f+headLen ∈ ℤ — a head↔thorax gap. */
  for (let i = 0; i < totalSteps && set.size < cap; i++) {
    const bt = totalSteps > 1 ? i / (totalSteps - 1) : 0;
    const archMag = o.bodyArch * 3.2 * Math.sin(Math.PI * bt);
    const along = add3(headFront, scale3(f, i));
    const center = add3(along, scale3(s, archMag));
    const { w, h } = segmentRadii(
      i,
      headLen,
      thoraxLen,
      abdomenLen,
      o.bodyHalfWidth,
      o.bodyHalfHeight,
      o.abdomenTaper,
      headShape01
    );
    fillSlice(set, center, s, u, w, h, cap);
  }

  if (set.size < cap && headLen > 0) {
    const snoutWide = 0.52 + 0.18 * (1 - headShape01);
    const snoutTall = 0.58 + 0.16 * (1 - headShape01);
    const tipWide = 0.34 + 0.16 * (1 - headShape01);
    const tipTall = 0.42 + 0.14 * (1 - headShape01);
    const noseCenter = add3(headFront, scale3(f, -0.28));
    const nw = Math.max(1, Math.round(o.bodyHalfWidth * snoutWide));
    const nh = Math.max(1, Math.round(o.bodyHalfHeight * snoutTall));
    fillSlice(set, noseCenter, s, u, nw, nh, cap);
    const noseTip = add3(headFront, scale3(f, -0.72));
    const tw = Math.max(1, Math.round(o.bodyHalfWidth * tipWide));
    const th = Math.max(1, Math.round(o.bodyHalfHeight * tipTall));
    fillSlice(set, noseTip, s, u, tw, th, cap);
  }

  /* Diptera: huge compound eyes as dorsolateral masses (does not use a separate material). */
  if (o.species === 'fly' && set.size < cap && headLen > 0) {
    const eyeAlong = Math.max(1, Math.round(headLen * 0.34));
    const eyeBase = add3(
      headFront,
      add3(scale3(f, eyeAlong), scale3(u, Math.max(1, Math.round(o.bodyHalfHeight * 0.28))))
    );
    const sep = Math.max(2, Math.round(o.bodyHalfWidth * 0.72));
    const ew = Math.max(2, Math.round(o.bodyHalfWidth * 0.55));
    const eh = Math.max(2, Math.round(o.bodyHalfHeight * 0.7));
    fillSlice(set, add3(eyeBase, scale3(s, -sep)), s, u, ew, eh, cap);
    fillSlice(set, add3(eyeBase, scale3(s, sep)), s, u, ew, eh, cap);
  }

  const legTips: Vec3[] = [];
  for (const leg of [o.legFront, o.legMid, o.legHind] as const) {
    const ends = attachArticulatedLegPair(set, thoraxCenter, f, s, u, leg, cap);
    if (ends) {
      legTips.push(ends[0], ends[1]);
    }
  }

  /* Rest shift uses global min(p·u); tips that are shallower along −u would float above the deepest.
   * Pad every leg straight along −u to the deepest tip depth so all feet meet the substrate (same
   * rule for every species; grasshopper keeps its hip/knee/foot frame — only the vertical reach is topped up). */
  if (legTips.length >= 2 && set.size < cap) {
    const dotU = (p: Vec3) => p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
    const minTipDot = Math.min(...legTips.map(dotU));
    const downDir = normalize3(scale3(u, -1));
    for (const tip of legTips) {
      const extra = Math.max(0, Math.round(dotU(tip) - minTipDot));
      if (extra > 0) {
        walkDirectedLeg(set, tip, s, u, downDir, extra, cap, 1, false);
      }
    }
  }

  if (o.antennaLength > 0 && set.size < cap) {
    const headMid = add3(headFront, scale3(f, headLen * 0.45));
    const antRoot = add3(headMid, scale3(f, -o.antennaRoot));
    const raised = add3(antRoot, scale3(u, Math.max(1, Math.round(o.bodyHalfHeight * 0.65))));
    const antSep = Math.max(0.55, o.bodyHalfWidth * 0.26);
    walkAntenna(
      set,
      add3(raised, scale3(s, antSep)),
      f,
      s,
      u,
      o.antennaLength,
      o.antennaSpread,
      o.antennaPitch,
      1,
      cap
    );
    walkAntenna(
      set,
      add3(raised, scale3(s, -antSep)),
      f,
      s,
      u,
      o.antennaLength,
      o.antennaSpread,
      o.antennaPitch,
      -1,
      cap
    );
  }

  if (o.mandibleLength > 0 && set.size < cap) {
    const jaw = add3(add3(headFront, scale3(f, headLen * 0.25)), scale3(u, -0.5));
    const lat = o.mandibleSpread * 0.12;
    walkMandible(set, jaw, f, s, o.mandibleLength, lat, 1, cap);
    walkMandible(set, jaw, f, s, o.mandibleLength, lat, -1, cap);
    if (o.mandibleForward > 0) {
      const tip = add3(jaw, scale3(f, -o.mandibleForward));
      walkMandible(set, tip, f, s, Math.max(1, o.mandibleLength - 1), lat * 0.6, 1, cap);
      walkMandible(set, tip, f, s, Math.max(1, o.mandibleLength - 1), lat * 0.6, -1, cap);
    }
  }

  const thoraxMidAlong = headLen + Math.max(0, Math.floor((thoraxLen - 1) / 2));
  const { w: thoraxWingHalfW, h: thoraxWingHalfH } = segmentRadii(
    thoraxMidAlong,
    headLen,
    thoraxLen,
    abdomenLen,
    o.bodyHalfWidth,
    o.bodyHalfHeight,
    o.abdomenTaper,
    headShape01
  );
  /* Roots on dorsal-lateral hinge: old attach used ~0.38 along s (inside body half-width). */
  const wingLateralOut = thoraxWingHalfW + 0.72;
  const wingDorsalUp = thoraxWingHalfH + 0.55;

  const wingShape01 = o.wingShape / 100;
  const wingAttach = (
    show: boolean,
    off: number,
    wlen: number,
    ww: number,
    sp: number,
    pit: number,
    forwardCantDeg: number
  ) => {
    if (!show || wlen <= 0 || set.size >= cap) return;
    const dorsalBase = add3(thoraxCenter, add3(scale3(f, off), scale3(u, wingDorsalUp)));
    addWingSheet(
      set,
      add3(dorsalBase, scale3(s, wingLateralOut)),
      f,
      s,
      u,
      wlen,
      ww,
      sp,
      pit,
      cap,
      1,
      wingShape01,
      forwardCantDeg
    );
    addWingSheet(
      set,
      add3(dorsalBase, scale3(s, -wingLateralOut)),
      f,
      s,
      u,
      wlen,
      ww,
      sp,
      pit,
      cap,
      -1,
      wingShape01,
      forwardCantDeg
    );
  };

  wingAttach(
    o.showWingFore,
    o.wingForeOffset,
    o.wingForeLength,
    o.wingForeWidth,
    o.wingForeSpread,
    o.wingForePitch,
    o.wingForeForwardCant
  );
  wingAttach(
    o.showWingHind,
    o.wingHindOffset,
    o.wingHindLength,
    o.wingHindWidth,
    o.wingHindSpread,
    o.wingHindPitch,
    0
  );

  shiftInsectaKeysAlongOutwardNormal(set, place, u);

  return set;
}

export function getInsectaPositions(
  _seed: number,
  place: [number, number, number],
  normal: FaceNormal,
  options: GenerateInsectaOptions
): [number, number, number][] {
  const keys = collectInsectaPositionKeys(place, normal, options);
  const out: [number, number, number][] = [];
  for (const k of keys) {
    out.push(parseCoordKey(k) as [number, number, number]);
  }
  return out;
}

export function generateInsectaVoxels(
  _seed: number,
  place: [number, number, number],
  normal: FaceNormal,
  options: GenerateInsectaOptions,
  getVoxel: () => Voxel
): Map<string, Voxel> {
  const keys = collectInsectaPositionKeys(place, normal, options);
  const map = new Map<string, Voxel>();
  const v = getVoxel();
  for (const k of keys) {
    map.set(k, cloneVoxel(v));
  }
  return map;
}
