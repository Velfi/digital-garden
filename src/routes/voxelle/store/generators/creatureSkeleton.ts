/**
 * Shared placement frame and skeletal bone graph for creature generators (piscina, insecta).
 *
 * Placement: face normal → orthonormal forward / side / up; second tangent = forward (nose→tail
 * on horizontal faces), matching historical piscina behavior.
 */
import { coordKey } from '../../coordUtils';
import type { FaceNormal } from '../core';
import type { ArticulatedLeg2, LegFrameOffset } from './articulatedLeg';

export type CreatureVec3 = readonly [number, number, number];

export type ResolvedCreatureBone = {
  id: string;
  parentId: string | null;
  /** World-space origin (float). */
  origin: CreatureVec3;
  forward: CreatureVec3;
  side: CreatureVec3;
  up: CreatureVec3;
};

/** Local translation in the parent bone’s (forward, side, up) frame. */
export type LocalBoneSpec = {
  id: string;
  parentId: string | null;
  localForward: number;
  localSide: number;
  localUp: number;
};

export function getCreatureTangentVectors(normal: FaceNormal): [FaceNormal, FaceNormal] {
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

/**
 * Second tangent = forward (head→tail); first = side (lateral). Matches piscina `piscinaForwardSide`.
 */
export function creatureForwardSideFromNormal(
  normal: FaceNormal
): { forward: FaceNormal; side: FaceNormal } {
  const [t1, t2] = getCreatureTangentVectors(normal);
  return { forward: t2, side: t1 };
}

export function rotateCreatureYawInPlane(
  f: CreatureVec3,
  s: CreatureVec3,
  yawDeg: number
): { f: CreatureVec3; s: CreatureVec3 } {
  const rad = (yawDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const si = Math.sin(rad);
  const nf: CreatureVec3 = [
    f[0] * c + s[0] * si,
    f[1] * c + s[1] * si,
    f[2] * c + s[2] * si
  ];
  const ns: CreatureVec3 = [
    s[0] * c - f[0] * si,
    s[1] * c - f[1] * si,
    s[2] * c - f[2] * si
  ];
  return { f: normalizeVec3(nf), s: normalizeVec3(ns) };
}

export function buildCreatureAnchorCenter(
  place: CreatureVec3,
  forward: CreatureVec3,
  side: CreatureVec3,
  anchorOffsetU: number,
  anchorOffsetV: number
): CreatureVec3 {
  return [
    place[0] + anchorOffsetU * forward[0] + anchorOffsetV * side[0],
    place[1] + anchorOffsetU * forward[1] + anchorOffsetV * side[1],
    place[2] + anchorOffsetU * forward[2] + anchorOffsetV * side[2]
  ] as const;
}

/** Insecta-style body frame: placement face + anchor offsets + optional yaw in tangent plane. */
export function buildInsectaBodyFrame(
  place: CreatureVec3,
  normal: FaceNormal,
  anchorOffsetU: number,
  anchorOffsetV: number,
  bodyYawDeg: number
): { center: CreatureVec3; forward: CreatureVec3; side: CreatureVec3; up: CreatureVec3 } {
  const { forward: f0, side: s0 } = creatureForwardSideFromNormal(normal);
  const { f, s } = rotateCreatureYawInPlane(f0, s0, bodyYawDeg);
  const u: CreatureVec3 = [normal[0], normal[1], normal[2]];
  const center = buildCreatureAnchorCenter(place, f, s, anchorOffsetU, anchorOffsetV);
  return { center, forward: f, side: s, up: u };
}

export function makeResolvedCreatureBone(
  id: string,
  parentId: string | null,
  origin: CreatureVec3,
  forward: CreatureVec3,
  side: CreatureVec3,
  up: CreatureVec3
): ResolvedCreatureBone {
  return { id, parentId, origin, forward, side, up };
}

/** Scalar names matching piscina `collectFishVoxels` fin/body station variables. */
export function unpackCreatureBoneScalars(b: ResolvedCreatureBone): {
  bx: number;
  by: number;
  bz: number;
  tx: number;
  ty: number;
  tz: number;
  sx: number;
  sy: number;
  sz: number;
  ux: number;
  uy: number;
  uz: number;
} {
  return {
    bx: b.origin[0],
    by: b.origin[1],
    bz: b.origin[2],
    tx: b.forward[0],
    ty: b.forward[1],
    tz: b.forward[2],
    sx: b.side[0],
    sy: b.side[1],
    sz: b.side[2],
    ux: b.up[0],
    uy: b.up[1],
    uz: b.up[2]
  };
}

/** Child with same orientation as parent; origin offset in parent’s (f,s,u). */
export function childBoneTranslated(
  parent: ResolvedCreatureBone,
  id: string,
  localForward: number,
  localSide: number,
  localUp: number
): ResolvedCreatureBone {
  const o: CreatureVec3 = [
    parent.origin[0] +
      localForward * parent.forward[0] +
      localSide * parent.side[0] +
      localUp * parent.up[0],
    parent.origin[1] +
      localForward * parent.forward[1] +
      localSide * parent.side[1] +
      localUp * parent.up[1],
    parent.origin[2] +
      localForward * parent.forward[2] +
      localSide * parent.side[2] +
      localUp * parent.up[2]
  ];
  return makeResolvedCreatureBone(id, parent.id, o, parent.forward, parent.side, parent.up);
}

/**
 * Resolve a forest of bones: each non-root spec’s parent must appear in `specs` or be listed before
 * children in insertion order. Roots use `root*` for the first bone with `parentId === null`.
 */
export function resolveLocalBoneSpecs(
  rootOrigin: CreatureVec3,
  rootForward: CreatureVec3,
  rootSide: CreatureVec3,
  rootUp: CreatureVec3,
  specs: LocalBoneSpec[]
): Map<string, ResolvedCreatureBone> {
  const map = new Map<string, ResolvedCreatureBone>();
  let remaining = specs.slice();
  let guard = 0;
  while (remaining.length > 0 && guard++ < specs.length + 2) {
    const next: LocalBoneSpec[] = [];
    for (const spec of remaining) {
      if (spec.parentId === null) {
        map.set(
          spec.id,
          makeResolvedCreatureBone(
            spec.id,
            null,
            rootOrigin,
            rootForward,
            rootSide,
            rootUp
          )
        );
        continue;
      }
      const parent = map.get(spec.parentId);
      if (!parent) {
        next.push(spec);
        continue;
      }
      map.set(
        spec.id,
        childBoneTranslated(
          parent,
          spec.id,
          spec.localForward,
          spec.localSide,
          spec.localUp
        )
      );
    }
    if (next.length === remaining.length) break;
    remaining = next;
  }
  return map;
}

export function piscinaSpineBoneId(k: number): string {
  return `piscina/spine/${k}`;
}

export function makePiscinaSpineStationBone(
  stationIndex: number,
  originX: number,
  originY: number,
  originZ: number,
  tangentX: number,
  tangentY: number,
  tangentZ: number,
  lateralX: number,
  lateralY: number,
  lateralZ: number,
  dorsoventralX: number,
  dorsoventralY: number,
  dorsoventralZ: number
): ResolvedCreatureBone {
  const parentId = stationIndex === 0 ? null : piscinaSpineBoneId(stationIndex - 1);
  const f = normalizeVec3([tangentX, tangentY, tangentZ]);
  const s = normalizeVec3([lateralX, lateralY, lateralZ]);
  const u = normalizeVec3([dorsoventralX, dorsoventralY, dorsoventralZ]);
  return makeResolvedCreatureBone(
    piscinaSpineBoneId(stationIndex),
    parentId,
    [originX, originY, originZ],
    f,
    s,
    u
  );
}

// —— Vec3 helpers (tuple) ——

function add3(a: CreatureVec3, b: CreatureVec3): CreatureVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as const;
}

function scale3(a: CreatureVec3, t: number): CreatureVec3 {
  return [a[0] * t, a[1] * t, a[2] * t] as const;
}

function len3(a: CreatureVec3): number {
  return Math.hypot(a[0], a[1], a[2]) || 1;
}

function normalizeVec3(a: CreatureVec3): CreatureVec3 {
  const L = len3(a);
  return [a[0] / L, a[1] / L, a[2] / L] as const;
}

function roundP(p: CreatureVec3): [number, number, number] {
  return [Math.round(p[0]), Math.round(p[1]), Math.round(p[2])];
}

function frameOffsetToWorld(
  f: CreatureVec3,
  s: CreatureVec3,
  u: CreatureVec3,
  off: LegFrameOffset,
  sideSign: number
): CreatureVec3 {
  return add3(
    add3(scale3(f, off[0]), scale3(s, off[1] * sideSign)),
    scale3(u, off[2])
  );
}

/** Step voxels along a world-space direction; optional femur rib along ±side. */
export function walkDirectedLegSegment(
  set: Set<string>,
  start: CreatureVec3,
  sAxis: CreatureVec3,
  dir: CreatureVec3,
  length: number,
  cap: number,
  sideSign: number,
  rib: boolean
): CreatureVec3 {
  if (length <= 0) return start;
  const d = normalizeVec3(dir);
  for (let i = 1; i <= length && set.size < cap; i++) {
    const p = add3(start, scale3(d, i));
    const [x, y, z] = roundP(p);
    if (set.size < cap) set.add(coordKey(x, y, z));
    if (rib && set.size < cap) {
      const q = add3(p, scale3(sAxis, sideSign));
      const [qx, qy, qz] = roundP(q);
      set.add(coordKey(qx, qy, qz));
    }
  }
  return add3(start, scale3(d, length));
}

export function insectaLegHipWorld(
  thoraxCenter: CreatureVec3,
  forward: CreatureVec3,
  side: CreatureVec3,
  leg: ArticulatedLeg2
): CreatureVec3 {
  return add3(thoraxCenter, add3(scale3(forward, leg.hipU), scale3(side, leg.hipV)));
}

/**
 * Joint world origins (float) along one leg side after each segment: [hip, afterFemur?, afterTibia?, afterTarsus?].
 */
export function insectaLegSideJointWorldOrigins(
  thoraxCenter: CreatureVec3,
  forward: CreatureVec3,
  side: CreatureVec3,
  up: CreatureVec3,
  leg: ArticulatedLeg2,
  sideSign: number
): CreatureVec3[] {
  const out: CreatureVec3[] = [];
  const hip = insectaLegHipWorld(thoraxCenter, forward, side, leg);
  out.push(hip);
  let cursor = hip;
  const wKnee = frameOffsetToWorld(forward, side, up, leg.knee, sideSign);
  const nk = Math.max(0, Math.round(len3(wKnee)));
  if (nk >= 1) {
    const d1 = normalizeVec3(wKnee);
    cursor = add3(cursor, scale3(d1, nk));
    out.push(cursor);
  }
  const wFoot = frameOffsetToWorld(forward, side, up, leg.foot, sideSign);
  const nf = Math.max(0, Math.round(len3(wFoot)));
  if (nf >= 1) {
    const d2 = normalizeVec3(wFoot);
    cursor = add3(cursor, scale3(d2, nf));
    out.push(cursor);
  }
  if (leg.tarsus) {
    const wTar = frameOffsetToWorld(forward, side, up, leg.tarsus, sideSign);
    const nt = Math.max(0, Math.round(len3(wTar)));
    if (nt >= 1) {
      const d3 = normalizeVec3(wTar);
      cursor = add3(cursor, scale3(d3, nt));
      out.push(cursor);
    }
  }
  return out;
}

/** Voxel placement for one mirrored leg pair; same behavior as legacy insecta `attachArticulatedLegPair`. */
export function attachArticulatedLegPairVoxels(
  set: Set<string>,
  thoraxCenter: CreatureVec3,
  forward: CreatureVec3,
  side: CreatureVec3,
  up: CreatureVec3,
  leg: ArticulatedLeg2,
  cap: number
): [CreatureVec3, CreatureVec3] | null {
  if (!leg.enabled || set.size >= cap) return null;
  const hip = insectaLegHipWorld(thoraxCenter, forward, side, leg);
  const ends: CreatureVec3[] = [];
  for (const sideSign of [1, -1] as const) {
    const wKnee = frameOffsetToWorld(forward, side, up, leg.knee, sideSign);
    const wFoot = frameOffsetToWorld(forward, side, up, leg.foot, sideSign);
    let cursor = hip;
    const nk = Math.max(0, Math.round(len3(wKnee)));
    if (nk >= 1) {
      const d1 = normalizeVec3(wKnee);
      cursor = walkDirectedLegSegment(
        set,
        cursor,
        side,
        d1,
        nk,
        cap,
        sideSign,
        leg.femurRib ?? false
      );
    }
    const nf = Math.max(0, Math.round(len3(wFoot)));
    if (nf >= 1) {
      const d2 = normalizeVec3(wFoot);
      cursor = walkDirectedLegSegment(set, cursor, side, d2, nf, cap, sideSign, false);
    }
    if (leg.tarsus) {
      const wTar = frameOffsetToWorld(forward, side, up, leg.tarsus, sideSign);
      const nt = Math.max(0, Math.round(len3(wTar)));
      if (nt >= 1) {
        const d3 = normalizeVec3(wTar);
        cursor = walkDirectedLegSegment(set, cursor, side, d3, nt, cap, sideSign, false);
      }
    }
    ends.push(cursor);
  }
  return [ends[0]!, ends[1]!];
}

const INSECTA_THORAX_ID = 'insecta/thorax';

export function buildInsectaThoraxBone(
  thoraxCenter: CreatureVec3,
  forward: CreatureVec3,
  side: CreatureVec3,
  up: CreatureVec3
): ResolvedCreatureBone {
  return makeResolvedCreatureBone(INSECTA_THORAX_ID, null, thoraxCenter, forward, side, up);
}

/**
 * Register thorax + leg joint bones (hip + post-femur / post-tibia / post-tarsus tips, L/R).
 */
export function buildInsectaLegSkeletonMap(
  thorax: ResolvedCreatureBone,
  leg: ArticulatedLeg2,
  legRole: 'front' | 'mid' | 'hind'
): Map<string, ResolvedCreatureBone> {
  const map = new Map<string, ResolvedCreatureBone>();
  map.set(thorax.id, thorax);
  if (!leg.enabled) return map;

  const hipId = `insecta/leg_${legRole}_hip`;
  map.set(hipId, childBoneTranslated(thorax, hipId, leg.hipU, leg.hipV, 0));

  for (const sideSign of [1, -1] as const) {
    const sideLabel = sideSign > 0 ? 'R' : 'L';
    const joints = insectaLegSideJointWorldOrigins(
      thorax.origin,
      thorax.forward,
      thorax.side,
      thorax.up,
      leg,
      sideSign
    );
    let parentId = hipId;
    for (let j = 1; j < joints.length; j++) {
      const id = `insecta/leg_${legRole}_${sideLabel}_seg${j}`;
      map.set(
        id,
        makeResolvedCreatureBone(
          id,
          parentId,
          joints[j]!,
          thorax.forward,
          thorax.side,
          thorax.up
        )
      );
      parentId = id;
    }
  }
  return map;
}

export function mergeCreatureBoneMaps(
  a: Map<string, ResolvedCreatureBone>,
  b: Map<string, ResolvedCreatureBone>
): Map<string, ResolvedCreatureBone> {
  const out = new Map(a);
  for (const [k, v] of b) {
    if (k === INSECTA_THORAX_ID && out.has(k)) continue;
    out.set(k, v);
  }
  return out;
}
