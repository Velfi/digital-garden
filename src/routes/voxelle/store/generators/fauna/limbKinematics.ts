import type { CreatureVec3 } from '../creatureSkeleton';
import type { FaunaLimbId, FaunaVec3, GenerateFaunaOptions } from './types';

function add3(a: CreatureVec3, b: CreatureVec3): CreatureVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(a: CreatureVec3, t: number): CreatureVec3 {
  return [a[0] * t, a[1] * t, a[2] * t];
}

/** Split lower limb into forearm/shin vs hand/foot along IK chain. */
export function splitLowerSegment(lowerTotal: number): { fore: number; hand: number } {
  const t = Math.max(1, lowerTotal);
  const fore = Math.max(0.35, t * 0.72);
  const hand = Math.max(0.25, t - fore);
  return { fore, hand };
}

export function getFaunaCenterLift(o: GenerateFaunaOptions): number {
  if (o.stance === 'biped') {
    return Math.max(0, o.hindUpperLength + o.hindLowerLength - 2);
  }
  return Math.max(
    0,
    Math.min(o.frontUpperLength + o.frontLowerLength, o.hindUpperLength + o.hindLowerLength) - 2
  );
}

export function faunaLocalToWorld(
  center: CreatureVec3,
  f: CreatureVec3,
  s: CreatureVec3,
  u: CreatureVec3,
  v: FaunaVec3
): CreatureVec3 {
  return add3(add3(add3(center, scale3(f, v[0])), scale3(s, v[1])), scale3(u, v[2]));
}

export function faunaWorldToLocal(
  center: CreatureVec3,
  f: CreatureVec3,
  s: CreatureVec3,
  u: CreatureVec3,
  p: FaunaVec3
): FaunaVec3 {
  const dx = p[0] - center[0];
  const dy = p[1] - center[1];
  const dz = p[2] - center[2];
  return [
    dx * f[0] + dy * f[1] + dz * f[2],
    dx * s[0] + dy * s[1] + dz * s[2],
    dx * u[0] + dy * u[1] + dz * u[2]
  ];
}

export function faunaDistalTargetDelta(
  o: GenerateFaunaOptions,
  isFront: boolean
): { liftU: number; forwardF: number } {
  const distalLift =
    o.archetype === 'ungulate'
      ? isFront
        ? 1.15
        : 1.75
      : o.archetype === 'digitigrade'
        ? isFront
          ? 0.7
          : 1.25
        : 0;
  const distalForward =
    o.archetype === 'ungulate' ? (isFront ? 0.6 : 1.05) : o.archetype === 'digitigrade' ? 0.6 : 0;
  return { liftU: distalLift, forwardF: distalForward };
}

export function limbRootFor(
  limb: FaunaLimbId,
  stance: GenerateFaunaOptions['stance'],
  chest: CreatureVec3,
  pelvis: CreatureVec3,
  forward: CreatureVec3,
  side: CreatureVec3,
  up: CreatureVec3,
  bodyHalfWidth: number,
  bodyHalfHeight: number,
  shoulderOffsetForward: number,
  hipOffsetForward: number
): CreatureVec3 {
  const sign = limb.endsWith('Left') ? -1 : 1;
  if (stance === 'biped') {
    const sideMul = bodyHalfWidth * 0.55;
    if (limb.startsWith('front')) {
      return add3(add3(chest, scale3(forward, shoulderOffsetForward)), scale3(side, sign * sideMul));
    }
    return add3(
      add3(pelvis, scale3(forward, hipOffsetForward)),
      scale3(side, sign * (bodyHalfWidth * 0.75))
    );
  }
  const frontSide = bodyHalfWidth * 0.82;
  const hindSide = bodyHalfWidth * 0.84;
  if (limb.startsWith('front')) {
    return add3(
      add3(add3(chest, scale3(forward, shoulderOffsetForward)), scale3(side, sign * frontSide)),
      scale3(up, -Math.max(0.2, bodyHalfHeight * 0.06))
    );
  }
  return add3(
    add3(add3(pelvis, scale3(forward, hipOffsetForward)), scale3(side, sign * hindSide)),
    scale3(up, -Math.max(0.35, bodyHalfHeight * 0.09))
  );
}

export function lengthsFor(limb: FaunaLimbId, o: GenerateFaunaOptions): [number, number] {
  const isFront = limb.startsWith('front');
  let upper = isFront ? o.frontUpperLength : o.hindUpperLength;
  let lower = isFront ? o.frontLowerLength : o.hindLowerLength;
  if (o.stance === 'biped' && isFront) {
    upper += 1;
    lower += 1;
  }
  if (o.archetype === 'digitigrade') {
    lower += 1;
  } else if (o.archetype === 'ungulate') {
    lower += 1;
    if (!isFront) upper += 1;
  }
  return [upper, lower];
}
