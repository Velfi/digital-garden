import type { FaceNormal } from '../../core';
import { buildInsectaBodyFrame, type CreatureVec3 } from '../creatureSkeleton';
import { getFaunaMorphBoneOriginsWorld, resolveFaunaSpinePosedOrigins } from './spinePose';
import { solveTwoBoneIk } from './ik';
import type { FaunaLimbId, FaunaPoseDistals, FaunaPoseMids, FaunaVec3, GenerateFaunaOptions } from './types';
import {
  faunaDistalTargetDelta,
  faunaLocalToWorld,
  faunaWorldToLocal,
  getFaunaCenterLift,
  lengthsFor,
  limbRootFor,
  splitLowerSegment
} from './limbKinematics';

function add3(a: CreatureVec3, b: CreatureVec3): CreatureVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(a: CreatureVec3, t: number): CreatureVec3 {
  return [a[0] * t, a[1] * t, a[2] * t];
}

function sub3(a: FaunaVec3, b: FaunaVec3): FaunaVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function len3(a: FaunaVec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize3(a: FaunaVec3): FaunaVec3 {
  const L = len3(a);
  if (L < 1e-8) return [0, 0, -1];
  return [a[0] / L, a[1] / L, a[2] / L];
}

function scaleV(a: FaunaVec3, t: number): FaunaVec3 {
  return [a[0] * t, a[1] * t, a[2] * t];
}

function addV(a: FaunaVec3, b: FaunaVec3): FaunaVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Derive default elbow/knee and wrist/ankle hints in creature-local space from 2-bone IK
 * (matches legacy single lower segment, split into fore + hand).
 */
export function deriveLimbJointLocalsForOptions(
  o: GenerateFaunaOptions,
  place: [number, number, number] = [0, 5, 0],
  normal: FaceNormal = [0, 1, 0]
): { limbMids: FaunaPoseMids; limbDistals: FaunaPoseDistals } {
  const frame = buildInsectaBodyFrame(place, normal, o.anchorOffsetU, o.anchorOffsetV, o.bodyYaw);
  const { center: frameCenter, forward: f, side: s, up: u } = frame;
  const center = add3(frameCenter, scale3(u, getFaunaCenterLift(o)));
  const morph = getFaunaMorphBoneOriginsWorld(place, normal, o);
  const posed = resolveFaunaSpinePosedOrigins(center, f, s, u, o, morph);
  const pelvis = posed.pelvis;
  const chest = posed.chest;

  const limbMids: FaunaPoseMids = {
    frontLeft: [0, 0, 0],
    frontRight: [0, 0, 0],
    hindLeft: [0, 0, 0],
    hindRight: [0, 0, 0]
  };
  const limbDistals: FaunaPoseDistals = {
    frontLeft: [0, 0, 0],
    frontRight: [0, 0, 0],
    hindLeft: [0, 0, 0],
    hindRight: [0, 0, 0]
  };

  const limbs: FaunaLimbId[] = ['frontLeft', 'frontRight', 'hindLeft', 'hindRight'];
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
    const baseTargetW = faunaLocalToWorld(center, f, s, u, o.limbTargets[limb]);
    const poleW = faunaLocalToWorld(center, f, s, u, o.limbPoles[limb]);
    const isFront = limb.startsWith('front');
    const { liftU, forwardF } = faunaDistalTargetDelta(o, isFront);
    const targetW = add3(add3(baseTargetW, scale3(u, liftU)), scale3(f, forwardF));
    const ik = solveTwoBoneIk(root as FaunaVec3, targetW as FaunaVec3, poleW as FaunaVec3, l1, l2full);
    const { fore } = splitLowerSegment(l2full);
    const dir = normalize3(sub3(ik.end, ik.joint));
    const distalW = addV(ik.joint, scaleV(dir, fore));
    limbMids[limb] = faunaWorldToLocal(center, f, s, u, ik.joint);
    limbDistals[limb] = faunaWorldToLocal(center, f, s, u, distalW);
  }

  return { limbMids, limbDistals };
}
