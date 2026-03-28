import type { FaceNormal } from '../../core';
import { buildInsectaBodyFrame, resolveLocalBoneSpecs, type CreatureVec3 } from '../creatureSkeleton';
import { buildFaunaSpineSpecs, FAUNA_BONE_IDS } from './skeleton';
import type { FaunaSpinePose, FaunaVec3, GenerateFaunaOptions } from './types';
import { getFaunaCenterLift } from './limbKinematics';

function add3(a: CreatureVec3, b: CreatureVec3): CreatureVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub3(a: CreatureVec3, b: CreatureVec3): CreatureVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale3(a: CreatureVec3, t: number): CreatureVec3 {
  return [a[0] * t, a[1] * t, a[2] * t];
}

/** Creature-local (F,S,U) offset → world delta (center at origin). */
export function faunaLocalDeltaWorld(
  f: CreatureVec3,
  s: CreatureVec3,
  u: CreatureVec3,
  v: FaunaVec3
): CreatureVec3 {
  return add3(add3(scale3(f, v[0]), scale3(s, v[1])), scale3(u, v[2]));
}

/** World delta expressed in (F,S,U) — inverse of `faunaLocalDeltaWorld` for orthonormal frame. */
export function faunaWorldDeltaToLocal(
  f: CreatureVec3,
  s: CreatureVec3,
  u: CreatureVec3,
  dw: CreatureVec3
): FaunaVec3 {
  return [
    dw[0] * f[0] + dw[1] * f[1] + dw[2] * f[2],
    dw[0] * s[0] + dw[1] * s[1] + dw[2] * s[2],
    dw[0] * u[0] + dw[1] * u[1] + dw[2] * u[2]
  ];
}

export const FAUNA_SPINE_POSE_ZERO: FaunaSpinePose = {
  chest: [0, 0, 0],
  neck: [0, 0, 0],
  head: [0, 0, 0]
};

/**
 * Morph-only bone origins (no spine pose), world space — for drag deltas and references.
 */
export function getFaunaMorphBoneOriginsWorld(
  place: [number, number, number],
  normal: FaceNormal,
  o: GenerateFaunaOptions
): {
  center: CreatureVec3;
  forward: CreatureVec3;
  side: CreatureVec3;
  up: CreatureVec3;
  pelvis: CreatureVec3;
  chest: CreatureVec3;
  neck: CreatureVec3;
  head: CreatureVec3;
  spineIds: string[];
  spineBoneOrigin: (id: string) => CreatureVec3 | undefined;
} {
  const frame = buildInsectaBodyFrame(place, normal, o.anchorOffsetU, o.anchorOffsetV, o.bodyYaw);
  const { center: frameCenter, forward: f, side: s, up: u } = frame;
  const center = add3(frameCenter, scale3(u, getFaunaCenterLift(o)));
  const { specs, spineIds } = buildFaunaSpineSpecs(o);
  const bones = resolveLocalBoneSpecs(center, f, s, u, specs);
  const spineBoneOrigin = (id: string): CreatureVec3 | undefined => bones.get(id)?.origin;
  return {
    center,
    forward: [f[0], f[1], f[2]],
    side: [s[0], s[1], s[2]],
    up: [u[0], u[1], u[2]],
    pelvis: bones.get(FAUNA_BONE_IDS.pelvis)?.origin ?? center,
    chest: bones.get(FAUNA_BONE_IDS.chest)?.origin ?? center,
    neck: bones.get(FAUNA_BONE_IDS.neck)?.origin ?? center,
    head: bones.get(FAUNA_BONE_IDS.head)?.origin ?? center,
    spineIds,
    spineBoneOrigin
  };
}

/**
 * Applies spine pose: chest offset blends along spine; neck/head add on top (chest → neck → head chain).
 */
export function resolveFaunaSpinePosedOrigins(
  center: CreatureVec3,
  f: CreatureVec3,
  s: CreatureVec3,
  u: CreatureVec3,
  o: GenerateFaunaOptions,
  morph: ReturnType<typeof getFaunaMorphBoneOriginsWorld>
): {
  pelvis: CreatureVec3;
  chest: CreatureVec3;
  neck: CreatureVec3;
  head: CreatureVec3;
  spineBoneOrigin: (id: string) => CreatureVec3 | undefined;
} {
  const { spineIds, spineBoneOrigin: morphOrigin } = morph;
  const dC = faunaLocalDeltaWorld(f, s, u, o.spinePose.chest);
  const dN = faunaLocalDeltaWorld(f, s, u, o.spinePose.neck);
  const dH = faunaLocalDeltaWorld(f, s, u, o.spinePose.head);
  const chestId = FAUNA_BONE_IDS.chest;
  const chestIdx = spineIds.indexOf(chestId);
  const denom = Math.max(1, chestIdx);

  const posedMap = new Map<string, CreatureVec3>();
  for (let i = 0; i < spineIds.length; i++) {
    const id = spineIds[i]!;
    const orig = morphOrigin(id);
    if (!orig) continue;
    const alpha = chestIdx > 0 ? i / denom : 0;
    posedMap.set(id, add3(orig, scale3(dC, alpha)));
  }

  const pelvis = morphOrigin(FAUNA_BONE_IDS.pelvis) ?? center;
  const chest = posedMap.get(chestId) ?? add3(morph.chest, dC);
  const neck0 = morphOrigin(FAUNA_BONE_IDS.neck) ?? morph.neck;
  const head0 = morphOrigin(FAUNA_BONE_IDS.head) ?? morph.head;
  const neck = add3(add3(neck0, dC), dN);
  const head = add3(add3(add3(head0, dC), dN), dH);

  const spineBoneOrigin = (id: string): CreatureVec3 | undefined => {
    if (id === FAUNA_BONE_IDS.neck) return neck;
    if (id === FAUNA_BONE_IDS.head) return head;
    return posedMap.get(id);
  };

  return { pelvis, chest, neck, head, spineBoneOrigin };
}
