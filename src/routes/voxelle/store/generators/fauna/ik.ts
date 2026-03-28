import type { FaunaVec3 } from './types';

export type TwoBoneIkResult = {
  joint: FaunaVec3;
  end: FaunaVec3;
  clampedTarget: FaunaVec3;
};

function add(a: FaunaVec3, b: FaunaVec3): FaunaVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: FaunaVec3, b: FaunaVec3): FaunaVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a: FaunaVec3, s: number): FaunaVec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function dot(a: FaunaVec3, b: FaunaVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function len(a: FaunaVec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a: FaunaVec3): FaunaVec3 {
  const l = len(a);
  if (l < 1e-6) return [0, 0, 1];
  return [a[0] / l, a[1] / l, a[2] / l];
}

function clampDistance(d: number, l1: number, l2: number): number {
  const hi = Math.max(1e-4, l1 + l2 - 1e-4);
  const lo = Math.max(1e-4, Math.abs(l1 - l2) + 1e-4);
  return Math.max(lo, Math.min(hi, d));
}

export function solveTwoBoneIk(
  root: FaunaVec3,
  target: FaunaVec3,
  pole: FaunaVec3,
  length1: number,
  length2: number
): TwoBoneIkResult {
  const toTarget = sub(target, root);
  const dRaw = len(toTarget);
  const d = clampDistance(dRaw < 1e-6 ? 1e-6 : dRaw, length1, length2);
  const dir = normalize(toTarget);
  const clampedTarget = add(root, scale(dir, d));
  const toPole = sub(pole, root);
  const polePlanar = sub(toPole, scale(dir, dot(toPole, dir)));
  const bend = normalize(len(polePlanar) < 1e-5 ? [0, 1, 0] : polePlanar);

  const a = (length1 * length1 - length2 * length2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, length1 * length1 - a * a));
  const mid = add(root, scale(dir, a));
  const joint = add(mid, scale(bend, h));
  return {
    joint,
    end: clampedTarget,
    clampedTarget
  };
}

function pullToward(anchor: FaunaVec3, point: FaunaVec3, dist: number): FaunaVec3 {
  const d = sub(point, anchor);
  const L = len(d);
  if (L < 1e-8) return add(anchor, [dist * 0.01, 0, -dist]);
  return add(anchor, scale(d, dist / L));
}

export type ThreeBoneFabrikResult = {
  mid: FaunaVec3;
  distal: FaunaVec3;
  end: FaunaVec3;
};

/**
 * 3-bone FABRIK: root–elbow/knee–wrist/ankle–tip. Hints bias bend plane; segment lengths enforced.
 */
export function solveThreeBoneFabrik(
  root: FaunaVec3,
  hintMid: FaunaVec3,
  hintDistal: FaunaVec3,
  target: FaunaVec3,
  len1: number,
  len2: number,
  len3: number,
  iterations = 8
): ThreeBoneFabrikResult {
  const L1 = Math.max(0.25, len1);
  const L2 = Math.max(0.25, len2);
  const L3 = Math.max(0.25, len3);

  let p0: FaunaVec3 = [...root];
  let p1: FaunaVec3 = pullToward(p0, hintMid, L1);
  let p2: FaunaVec3 = pullToward(p1, hintDistal, L2);
  let p3: FaunaVec3 = pullToward(p2, target, L3);

  const t: FaunaVec3 = [target[0], target[1], target[2]];
  for (let it = 0; it < iterations; it++) {
    p3 = [t[0], t[1], t[2]];
    p2 = pullToward(p3, p2, L3);
    p1 = pullToward(p2, p1, L2);
    p0 = pullToward(p1, p0, L1);
    p0 = [...root];
    p1 = pullToward(p0, p1, L1);
    p2 = pullToward(p1, p2, L2);
    p3 = pullToward(p2, p3, L3);
  }

  return { mid: p1, distal: p2, end: p3 };
}

