import { coordKey, parseCoordKey } from '../../../coordUtils';
import type { FaceNormal } from '../../core';
import type { Voxel } from '../../../voxelMaterial';
import { cloneVoxel } from '../../../voxelMaterial';
import { type CreatureVec3 } from '../creatureSkeleton';
import { RAW_FAUNA_DEFAULTS } from './defaultsRaw';
import { deriveQuadrupedAutoFootTargets } from './autoFootTargets';
import { deriveLimbJointLocalsForOptions } from './deriveLimbJoints';
import { solveThreeBoneFabrik } from './ik';
import {
  faunaDistalTargetDelta,
  faunaLocalToWorld,
  getFaunaCenterLift,
  lengthsFor,
  limbRootFor,
  splitLowerSegment
} from './limbKinematics';
import type { FaunaLimbId, FaunaSectionDims, FaunaVec3, GenerateFaunaOptions } from './types';
import { getFaunaMorphBoneOriginsWorld, resolveFaunaSpinePosedOrigins } from './spinePose';

export const FAUNA_VOXEL_CAP = 12000;

export { getFaunaCenterLift } from './limbKinematics';

function add3(a: CreatureVec3, b: CreatureVec3): CreatureVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(a: CreatureVec3, t: number): CreatureVec3 {
  return [a[0] * t, a[1] * t, a[2] * t];
}

function localToWorld(c: CreatureVec3, f: CreatureVec3, s: CreatureVec3, u: CreatureVec3, v: FaunaVec3) {
  return faunaLocalToWorld(c, f, s, u, v);
}

function round3(p: CreatureVec3): [number, number, number] {
  return [Math.round(p[0]), Math.round(p[1]), Math.round(p[2])];
}

function fillSlice(
  set: Set<string>,
  center: CreatureVec3,
  s: CreatureVec3,
  u: CreatureVec3,
  w: number,
  h: number,
  cap: number
): void {
  const [cx, cy, cz] = round3(center);
  for (let ds = -w; ds <= w; ds++) {
    for (let du = -h; du <= h; du++) {
      if (set.size >= cap) return;
      const x = cx + Math.round(s[0] * ds + u[0] * du);
      const y = cy + Math.round(s[1] * ds + u[1] * du);
      const z = cz + Math.round(s[2] * ds + u[2] * du);
      set.add(coordKey(x, y, z));
    }
  }
}

function tryAdd(set: Set<string>, x: number, y: number, z: number, cap: number): boolean {
  if (set.size >= cap) return false;
  set.add(coordKey(x, y, z));
  return true;
}

function fillSliceBridge(
  set: Set<string>,
  a: CreatureVec3,
  b: CreatureVec3,
  s: CreatureVec3,
  u: CreatureVec3,
  wa: number,
  ha: number,
  wb: number,
  hb: number,
  cap: number
): void {
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  const dz = Math.abs(b[2] - a[2]);
  const steps = Math.max(1, Math.ceil(Math.max(dx, dy, dz) * 2));
  for (let i = 1; i < steps; i++) {
    if (set.size >= cap) return;
    const t = i / steps;
    const c: CreatureVec3 = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
    const w = Math.max(1, Math.round(wa + (wb - wa) * t));
    const h = Math.max(1, Math.round(ha + (hb - ha) * t));
    fillSlice(set, c, s, u, w, h, cap);
  }
}

function fillSphere(set: Set<string>, center: CreatureVec3, radius: number, cap: number): void {
  if (radius <= 0) return;
  const [cx, cy, cz] = round3(center);
  const rr = Math.max(1, Math.round(radius));
  const rr2 = rr * rr;
  for (let x = -rr; x <= rr; x++) {
    for (let y = -rr; y <= rr; y++) {
      for (let z = -rr; z <= rr; z++) {
        if (x * x + y * y + z * z > rr2) continue;
        if (!tryAdd(set, cx + x, cy + y, cz + z, cap)) return;
      }
    }
  }
}

function fillSegmentCapsule(
  set: Set<string>,
  a: CreatureVec3,
  b: CreatureVec3,
  rA: number,
  rB: number,
  cap: number
): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const dist = Math.hypot(dx, dy, dz);
  const steps = Math.max(1, Math.ceil(dist * 2));
  for (let i = 0; i <= steps; i++) {
    if (set.size >= cap) return;
    const t = i / steps;
    const c: CreatureVec3 = [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t];
    const r = Math.max(1, Math.round(rA + (rB - rA) * t));
    fillSphere(set, c, r, cap);
  }
}

function fillOrientedEllipsoid(
  set: Set<string>,
  center: CreatureVec3,
  f: CreatureVec3,
  s: CreatureVec3,
  u: CreatureVec3,
  rF: number,
  rS: number,
  rU: number,
  cap: number
): void {
  const rf = Math.max(1, Math.round(rF));
  const rs = Math.max(1, Math.round(rS));
  const ru = Math.max(1, Math.round(rU));
  for (let df = -rf; df <= rf; df++) {
    for (let ds = -rs; ds <= rs; ds++) {
      for (let du = -ru; du <= ru; du++) {
        const q = (df * df) / (rf * rf) + (ds * ds) / (rs * rs) + (du * du) / (ru * ru);
        if (q > 1) continue;
        const p: CreatureVec3 = [
          center[0] + df * f[0] + ds * s[0] + du * u[0],
          center[1] + df * f[1] + ds * s[1] + du * u[1],
          center[2] + df * f[2] + ds * s[2] + du * u[2]
        ];
        const [x, y, z] = round3(p);
        if (!tryAdd(set, x, y, z, cap)) return;
      }
    }
  }
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function clampVec3(lo: number, hi: number, v: FaunaVec3): FaunaVec3 {
  return [Math.max(lo, Math.min(hi, v[0])), Math.max(lo, Math.min(hi, v[1])), Math.max(lo, Math.min(hi, v[2]))];
}

function mergeSectionDims(raw: FaunaSectionDims | undefined, base: FaunaSectionDims): FaunaSectionDims {
  if (!raw) return { ...base };
  return {
    length: raw.length ?? base.length,
    halfWidth: raw.halfWidth ?? base.halfWidth,
    halfHeight: raw.halfHeight ?? base.halfHeight
  };
}

function clampSectionDims(
  d: FaunaSectionDims,
  lenLo: number,
  lenHi: number,
  halfLo: number,
  halfHi: number
): FaunaSectionDims {
  return {
    length: clampInt(d.length, lenLo, lenHi),
    halfWidth: clampInt(d.halfWidth, halfLo, halfHi),
    halfHeight: clampInt(d.halfHeight, halfLo, halfHi)
  };
}

function clampOptions(raw: GenerateFaunaOptions): GenerateFaunaOptions {
  const stance = raw.stance === 'biped' ? 'biped' : 'quadruped';
  const archetype =
    raw.archetype === 'plantigrade' || raw.archetype === 'digitigrade' || raw.archetype === 'ungulate'
      ? raw.archetype
      : stance === 'biped'
        ? 'plantigrade'
        : 'digitigrade';
  const morphBase = RAW_FAUNA_DEFAULTS[stance];
  const z: FaunaVec3 = [0, 0, 0];
  const emptyJoints = {
    frontLeft: z,
    frontRight: z,
    hindLeft: z,
    hindRight: z
  };
  const autoFootPlacement =
    stance === 'quadruped' && (raw.autoFootPlacement ?? morphBase.autoFootPlacement ?? false);
  const merged: GenerateFaunaOptions = {
    ...morphBase,
    ...raw,
    stance,
    archetype,
    autoFootPlacement,
    limbTargets: { ...morphBase.limbTargets, ...raw.limbTargets },
    limbPoles: { ...morphBase.limbPoles, ...raw.limbPoles },
    limbMids: raw.limbMids ?? emptyJoints,
    limbDistals: raw.limbDistals ?? emptyJoints,
    spinePose: {
      chest: [...(raw.spinePose?.chest ?? morphBase.spinePose.chest)] as FaunaVec3,
      neck: [...(raw.spinePose?.neck ?? morphBase.spinePose.neck)] as FaunaVec3,
      head: [...(raw.spinePose?.head ?? morphBase.spinePose.head)] as FaunaVec3
    },
    bodyDims: mergeSectionDims(raw.bodyDims, morphBase.bodyDims),
    neckDims: mergeSectionDims(raw.neckDims, morphBase.neckDims),
    headDims: mergeSectionDims(raw.headDims, morphBase.headDims)
  };
  const clamped: GenerateFaunaOptions = {
    ...merged,
    anchorOffsetU: clampInt(raw.anchorOffsetU, -24, 24),
    anchorOffsetV: clampInt(raw.anchorOffsetV, -24, 24),
    bodyYaw: Math.max(-45, Math.min(45, raw.bodyYaw)),
    bodyArch: Math.max(-1, Math.min(1, raw.bodyArch)),
    spineSegments: clampInt(raw.spineSegments, 3, 12),
    bodyDims: clampSectionDims(merged.bodyDims, 8, 48, 1, 12),
    neckDims: clampSectionDims(merged.neckDims, 1, 24, 1, 12),
    headDims: clampSectionDims(merged.headDims, 1, 24, 1, 12),
    tailLength: clampInt(raw.tailLength, 0, 16),
    shoulderOffsetForward: clampInt(raw.shoulderOffsetForward, -24, 24),
    hipOffsetForward: clampInt(raw.hipOffsetForward, -24, 24),
    frontUpperLength: clampInt(raw.frontUpperLength, 1, 16),
    frontLowerLength: clampInt(raw.frontLowerLength, 1, 16),
    hindUpperLength: clampInt(raw.hindUpperLength, 1, 16),
    hindLowerLength: clampInt(raw.hindLowerLength, 1, 16),
    spinePose: {
      chest: clampVec3(-24, 24, merged.spinePose.chest),
      neck: clampVec3(-24, 24, merged.spinePose.neck),
      head: clampVec3(-24, 24, merged.spinePose.head)
    }
  };
  let limbTargets = clamped.limbTargets;
  let limbPoles = clamped.limbPoles;
  if (clamped.stance === 'quadruped' && clamped.autoFootPlacement) {
    const auto = deriveQuadrupedAutoFootTargets(clamped);
    limbTargets = auto.limbTargets;
    limbPoles = auto.limbPoles;
  }
  const withFeet: GenerateFaunaOptions = { ...clamped, limbTargets, limbPoles };
  const derived = deriveLimbJointLocalsForOptions(withFeet);
  return {
    ...withFeet,
    limbMids: { ...derived.limbMids, ...(raw.limbMids ?? {}) },
    limbDistals: { ...derived.limbDistals, ...(raw.limbDistals ?? {}) }
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function spineProfileMul(stance: GenerateFaunaOptions['stance'], t: number): { w: number; h: number } {
  if (stance !== 'biped') {
    const tt = Math.max(0, Math.min(1, t));
    if (tt < 0.45) {
      const u = tt / 0.45;
      return { w: lerp(0.78, 0.62, u), h: lerp(0.82, 0.7, u) };
    }
    const u = (tt - 0.45) / 0.55;
    return { w: lerp(0.62, 0.88, u), h: lerp(0.7, 0.92, u) };
  }
  // Biped: stronger torso taper (shoulders/hips > waist) to avoid a rectangular trunk.
  const tt = Math.max(0, Math.min(1, t));
  if (tt < 0.55) {
    const u = tt / 0.55;
    return { w: lerp(0.94, 0.62, u), h: lerp(0.92, 0.72, u) };
  }
  const u = (tt - 0.55) / 0.45;
  return { w: lerp(0.62, 0.9, u), h: lerp(0.72, 0.86, u) };
}

/** World-space FABRIK joints for gizmos (matches voxel limb; not raw local hints). */
export type FaunaResolvedLimbHandlesWorld = Record<
  FaunaLimbId,
  {
    tip: [number, number, number];
    mid: [number, number, number];
    distal: [number, number, number];
    pole: [number, number, number];
  }
>;

export function getFaunaResolvedLimbHandlesWorld(
  place: [number, number, number],
  normal: FaceNormal,
  raw: GenerateFaunaOptions
): FaunaResolvedLimbHandlesWorld {
  const o = clampOptions(raw);
  const morph = getFaunaMorphBoneOriginsWorld(place, normal, o);
  const center = morph.center;
  const f = morph.forward;
  const s = morph.side;
  const u = morph.up;
  const posed = resolveFaunaSpinePosedOrigins(center, f, s, u, o, morph);
  const pelvis = posed.pelvis;
  const chest = posed.chest;

  const limbs: FaunaLimbId[] = ['frontLeft', 'frontRight', 'hindLeft', 'hindRight'];
  const out = {} as FaunaResolvedLimbHandlesWorld;
  for (const limb of limbs) {
    const root = limbRootFor(
      limb,
      o.stance,
      chest,
      pelvis,
      f,
      s,
      u,
      o.bodyDims.halfWidth,
      o.bodyDims.halfHeight,
      o.shoulderOffsetForward,
      o.hipOffsetForward
    );
    const [l1, l2full] = lengthsFor(limb, o);
    const { fore: foreLen, hand: handLen } = splitLowerSegment(l2full);
    const baseTargetW = localToWorld(center, f, s, u, o.limbTargets[limb]);
    const isFront = limb.startsWith('front');
    const { liftU, forwardF } = faunaDistalTargetDelta(o, isFront);
    const targetW = add3(add3(baseTargetW, scale3(u, liftU)), scale3(f, forwardF));
    const hintMid = localToWorld(center, f, s, u, o.limbMids[limb]);
    const hintDistal = localToWorld(center, f, s, u, o.limbDistals[limb]);
    const poleW = localToWorld(center, f, s, u, o.limbPoles[limb]);
    const fab = solveThreeBoneFabrik(
      root as FaunaVec3,
      hintMid as FaunaVec3,
      hintDistal as FaunaVec3,
      targetW as FaunaVec3,
      l1,
      foreLen,
      handLen
    );
    out[limb] = {
      tip: [fab.end[0], fab.end[1], fab.end[2]],
      mid: [fab.mid[0], fab.mid[1], fab.mid[2]],
      distal: [fab.distal[0], fab.distal[1], fab.distal[2]],
      pole: [poleW[0], poleW[1], poleW[2]]
    };
  }
  return out;
}

/** World positions for chest / neck / head pose handles (matches voxel spine). */
export function getFaunaResolvedSpineHandlesWorld(
  place: [number, number, number],
  normal: FaceNormal,
  raw: GenerateFaunaOptions
): {
  chest: [number, number, number];
  neck: [number, number, number];
  head: [number, number, number];
} {
  const o = clampOptions(raw);
  const morph = getFaunaMorphBoneOriginsWorld(place, normal, o);
  const posed = resolveFaunaSpinePosedOrigins(morph.center, morph.forward, morph.side, morph.up, o, morph);
  return {
    chest: [posed.chest[0], posed.chest[1], posed.chest[2]],
    neck: [posed.neck[0], posed.neck[1], posed.neck[2]],
    head: [posed.head[0], posed.head[1], posed.head[2]]
  };
}

function collectFaunaKeys(
  place: [number, number, number],
  normal: FaceNormal,
  raw: GenerateFaunaOptions
): Set<string> {
  const o = clampOptions(raw);
  const cap = FAUNA_VOXEL_CAP;
  const set = new Set<string>();
  const morph = getFaunaMorphBoneOriginsWorld(place, normal, o);
  const center = morph.center;
  const f = morph.forward;
  const s = morph.side;
  const u = morph.up;
  const posed = resolveFaunaSpinePosedOrigins(center, f, s, u, o, morph);
  const pelvis = posed.pelvis;
  const chest = posed.chest;
  const neck = posed.neck;
  const head = posed.head;
  const spineIds = morph.spineIds;

  let prevCenter: CreatureVec3 | null = null;
  let prevW = 0;
  let prevH = 0;
  for (let i = 0; i < spineIds.length; i++) {
    const id = spineIds[i]!;
    const origin = posed.spineBoneOrigin(id);
    if (!origin) continue;
    const t = spineIds.length <= 1 ? 0 : i / (spineIds.length - 1);
    const mul = spineProfileMul(o.stance, t);
    const width = Math.max(1, Math.round(o.bodyDims.halfWidth * mul.w));
    const height = Math.max(1, Math.round(o.bodyDims.halfHeight * mul.h));
    fillSlice(set, origin, s, u, width, height, cap);
    if (prevCenter) {
      fillSliceBridge(set, prevCenter, origin, s, u, prevW, prevH, width, height, cap);
    }
    prevCenter = origin;
    prevW = width;
    prevH = height;
  }

  // Localized masses to break cylindrical silhouette: hips/pelvis and chest/shoulders.
  const pelvisForwardMul = o.stance === 'quadruped' ? 0.65 : o.stance === 'biped' ? 0.72 : 0.55;
  const pelvisSideMul = o.stance === 'quadruped' ? 0.95 : o.stance === 'biped' ? 0.96 : 1.05;
  const pelvisUpMul = o.stance === 'quadruped' ? 0.72 : o.stance === 'biped' ? 0.76 : 0.75;
  fillOrientedEllipsoid(
    set,
    pelvis,
    f,
    s,
    u,
    Math.max(1, o.bodyDims.halfWidth * pelvisForwardMul),
    Math.max(1, o.bodyDims.halfWidth * pelvisSideMul),
    Math.max(1, o.bodyDims.halfHeight * pelvisUpMul),
    cap
  );
  // Quadruped: extra rump / upper haunch behind pelvis (glute–thigh bulk).
  if (o.stance === 'quadruped') {
    const rumpBack = Math.max(2, o.bodyDims.halfWidth * 0.42 + o.bodyDims.length * 0.06);
    fillOrientedEllipsoid(
      set,
      add3(add3(pelvis, scale3(f, -rumpBack)), scale3(u, -o.bodyDims.halfHeight * 0.18)),
      f,
      s,
      u,
      Math.max(1, o.bodyDims.halfWidth * 0.68),
      Math.max(1, o.bodyDims.halfWidth * 1.22),
      Math.max(1, o.bodyDims.halfHeight * 0.62),
      cap
    );
  }
  fillOrientedEllipsoid(
    set,
    chest,
    f,
    s,
    u,
    Math.max(1, o.bodyDims.halfWidth * (o.stance === 'biped' ? 0.72 : 0.62)),
    Math.max(1, o.bodyDims.halfWidth * (o.stance === 'biped' ? 0.98 : 1.0)),
    Math.max(1, o.bodyDims.halfHeight * (o.stance === 'biped' ? 0.52 : 0.85)),
    cap
  );

  // Soft belly volume for quadrupeds / creatures.
  if (o.stance === 'quadruped') {
    fillOrientedEllipsoid(
      set,
      add3(add3(pelvis, scale3(f, o.bodyDims.length * 0.28)), scale3(u, -o.bodyDims.halfHeight * 0.35)),
      f,
      s,
      u,
      Math.max(1, o.bodyDims.halfWidth * 0.4),
      Math.max(1, o.bodyDims.halfWidth * 0.75),
      Math.max(1, o.bodyDims.halfHeight * 0.5),
      cap
    );
  }
  if (o.stance === 'biped') {
    // Centered abdomen core keeps torso depth without lower-front protrusion.
    const abdomenA = add3(add3(pelvis, scale3(f, o.bodyDims.length * 0.26)), scale3(u, o.bodyDims.halfHeight * 0.02));
    const abdomenB = add3(add3(chest, scale3(f, -o.bodyDims.length * 0.16)), scale3(u, -o.bodyDims.halfHeight * 0.02));
    fillSegmentCapsule(set, abdomenA, abdomenB, 0.8, 0.68, cap);
  }

  const isBiped = o.stance === 'biped';
  const headBaseW = isBiped
    ? Math.max(1, Math.round(Math.min(o.headDims.halfWidth * 0.95, o.headDims.length * 0.45 + 0.65)))
    : Math.max(1, o.headDims.halfWidth - 1);
  const headBaseH =
    isBiped
      ? Math.max(1, Math.round(Math.min(o.headDims.halfHeight * 0.95, o.headDims.length * 0.5 + 0.65)))
      : Math.max(1, o.headDims.halfHeight - 1);
  const neckBridgeW = isBiped
    ? Math.max(1, Math.round(o.neckDims.halfWidth * 0.42))
    : Math.max(1, o.neckDims.halfWidth - 1);
  const neckBridgeH = isBiped
    ? Math.max(1, Math.round(o.neckDims.halfHeight * 0.42))
    : Math.max(1, o.neckDims.halfHeight - 1);
  if (isBiped) {
    fillSegmentCapsule(set, chest, neck, 0.95, 0.85, cap);
    fillSphere(set, add3(head, scale3(u, 0.45)), Math.max(1, o.headDims.length * 0.72), cap);
  } else {
    fillSlice(set, head, s, u, headBaseW, headBaseH, cap);
    fillSliceBridge(
      set,
      chest,
      neck,
      s,
      u,
      neckBridgeW,
      neckBridgeH,
      Math.max(1, neckBridgeW - 1),
      Math.max(1, neckBridgeH - 1),
      cap
    );
  }
  // Cranial mass + slight muzzle/jaw block.
  fillOrientedEllipsoid(
    set,
    add3(head, scale3(u, isBiped ? o.headDims.halfHeight * 0.18 : o.headDims.halfHeight * 0.05)),
    f,
    s,
    u,
    Math.max(1, o.headDims.length * (isBiped ? 0.38 : 0.55)),
    Math.max(1, isBiped ? headBaseW * 0.72 : o.headDims.halfWidth * 0.82),
    Math.max(1, isBiped ? headBaseH * 0.8 : o.headDims.halfHeight * 0.78),
    cap
  );
  fillSliceBridge(
    set,
    neck,
    head,
    s,
    u,
    neckBridgeW,
    neckBridgeH,
    headBaseW,
    headBaseH,
    cap
  );
  if (isBiped) {
    fillSegmentCapsule(set, neck, head, 1, 1.2, cap);
  }
  if (!isBiped) {
    const snoutLen = Math.max(1, o.headDims.length * 0.5);
    const snout = add3(head, scale3(f, snoutLen));
    const snoutW = Math.max(1, o.headDims.halfWidth - 2);
    const snoutH = Math.max(1, o.headDims.halfHeight - 2);
    fillSlice(
      set,
      snout,
      s,
      u,
      snoutW,
      snoutH,
      cap
    );
    fillSliceBridge(
      set,
      head,
      snout,
      s,
      u,
      headBaseW,
      headBaseH,
      snoutW,
      snoutH,
      cap
    );
    fillOrientedEllipsoid(
      set,
      add3(snout, scale3(u, -0.35)),
      f,
      s,
      u,
      Math.max(1, o.headDims.length * 0.22),
      Math.max(1, o.headDims.halfWidth * 0.45),
      1,
      cap
    );
  }

  for (let i = 1; i <= o.tailLength && set.size < cap; i++) {
    const p = add3(pelvis, scale3(f, -i));
    const [x, y, z] = round3(p);
    set.add(coordKey(x, y, z));
  }

  const limbs: FaunaLimbId[] = ['frontLeft', 'frontRight', 'hindLeft', 'hindRight'];
  for (const limb of limbs) {
    if (set.size >= cap) break;
    const root = limbRootFor(
      limb,
      o.stance,
      chest,
      pelvis,
      f,
      s,
      u,
      o.bodyDims.halfWidth,
      o.bodyDims.halfHeight,
      o.shoulderOffsetForward,
      o.hipOffsetForward
    );
    const [l1, l2full] = lengthsFor(limb, o);
    const { fore: foreLen, hand: handLen } = splitLowerSegment(l2full);
    const baseTargetW = localToWorld(center, f, s, u, o.limbTargets[limb]);
    const isFront = limb.startsWith('front');
    const { liftU, forwardF } = faunaDistalTargetDelta(o, isFront);
    const targetW = add3(add3(baseTargetW, scale3(u, liftU)), scale3(f, forwardF));
    const hintMid = localToWorld(center, f, s, u, o.limbMids[limb]);
    const hintDistal = localToWorld(center, f, s, u, o.limbDistals[limb]);
    const fab = solveThreeBoneFabrik(
      root as FaunaVec3,
      hintMid as FaunaVec3,
      hintDistal as FaunaVec3,
      targetW as FaunaVec3,
      l1,
      foreLen,
      handLen
    );
    const mid = fab.mid as CreatureVec3;
    const distal = fab.distal as CreatureVec3;
    const end = fab.end as CreatureVec3;
    const upperR =
      o.stance === 'biped'
        ? isFront
          ? 1.1
          : 1.35
        : isFront
          ? 1.2
          : 1.35;
    const lowerR =
      o.stance === 'biped'
        ? isFront
          ? 0.9
          : 1.15
        : isFront
          ? 1
          : 1.18;
    const lowerRArchetyped =
      o.archetype === 'ungulate' ? Math.max(0.8, lowerR * 0.78) : o.archetype === 'digitigrade' ? lowerR * 0.9 : lowerR;
    const midR = lowerR * 0.95;
    const distalR = Math.max(0.8, lowerRArchetyped * 0.92);
    const tipR = Math.max(0.75, lowerRArchetyped * (o.archetype === 'plantigrade' ? 0.82 : 0.72));
    fillSegmentCapsule(set, root, mid, upperR, midR, cap);
    fillSegmentCapsule(set, mid, distal, midR, distalR, cap);
    fillSegmentCapsule(set, distal, end, distalR, tipR, cap);

    // Foot / paw / hand mass at IK end effector.
    const footLen = isFront ? 1.4 : 1.9;
    const footCenter = add3(end, scale3(f, footLen * 0.45));
    if (o.archetype === 'ungulate') {
      const hoofTip = add3(add3(footCenter, scale3(f, 0.65)), scale3(u, -0.7));
      fillSegmentCapsule(set, end, hoofTip, 0.8, 0.65, cap);
      fillOrientedEllipsoid(set, hoofTip, f, s, u, 0.95, 0.55, 0.55, cap);
    } else if (o.archetype === 'digitigrade') {
      const toe = add3(add3(footCenter, scale3(f, 0.75)), scale3(u, -0.45));
      fillSegmentCapsule(set, end, toe, Math.max(0.8, lowerRArchetyped * 0.72), 0.85, cap);
      fillOrientedEllipsoid(set, toe, f, s, u, isFront ? 1.15 : 1.45, isFront ? 0.85 : 0.95, 0.62, cap);
      fillSphere(set, add3(end, scale3(u, 0.25)), 0.85, cap);
    } else {
      fillOrientedEllipsoid(
        set,
        footCenter,
        f,
        s,
        u,
        isFront ? 1.1 : 1.5,
        isFront ? 0.95 : 1.1,
        0.75,
        cap
      );
    }
  }
  return set;
}

export function getFaunaPositions(
  _seed: number,
  place: [number, number, number],
  normal: FaceNormal,
  options: GenerateFaunaOptions
): [number, number, number][] {
  const keys = collectFaunaKeys(place, normal, options);
  const out: [number, number, number][] = [];
  for (const k of keys) out.push(parseCoordKey(k) as [number, number, number]);
  return out;
}

export function generateFaunaVoxels(
  _seed: number,
  place: [number, number, number],
  normal: FaceNormal,
  options: GenerateFaunaOptions,
  getVoxel: (x: number, y: number, z: number) => Voxel
): Map<string, Voxel> {
  const keys = collectFaunaKeys(place, normal, options);
  const out = new Map<string, Voxel>();
  for (const k of keys) {
    const [x, y, z] = parseCoordKey(k);
    out.set(k, cloneVoxel(getVoxel(x, y, z)));
  }
  return out;
}

export { clampOptions as clampFaunaOptions };

