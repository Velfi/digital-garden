/**
 * Two- or three-bone leg in the placement body frame (insecta, arachnids, mantises, etc.).
 *
 * Axes (orthonormal on the anchor face):
 * - +f: head → abdomen
 * - +s: right when viewed from outside the surface (left leg mirrors −s)
 * - +u: outward from the placement face (substrate is generally −u)
 *
 * Pairs are mirrored: the same knee/foot triples describe the right leg; the left leg uses −s on
 * lateral components when building world offsets.
 */
export type LegFrameOffset = readonly [f: number, s: number, u: number];

export type ArticulatedLeg2 = {
  enabled: boolean;
  /** Hip along +f from thorax anchor (voxels). */
  hipU: number;
  /** Hip along +s from thorax anchor (voxels). */
  hipV: number;
  /** Hip → knee (femur). */
  knee: LegFrameOffset;
  /** Knee → tibia tip (tibia / lower leg toward substrate). */
  foot: LegFrameOffset;
  /** Tibia tip → tarsus end (e.g. flat segment along +f on the ground); omit or [0,0,0] to skip. */
  tarsus?: LegFrameOffset;
  /** Second voxel parallel to +s along the femur (thicker thigh). */
  femurRib?: boolean;
};

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function clampComp(n: number): number {
  return clampInt(n, -24, 24);
}

export function clampArticulatedLeg2(raw: ArticulatedLeg2): ArticulatedLeg2 {
  return {
    enabled: Boolean(raw.enabled),
    hipU: clampInt(raw.hipU, -8, 8),
    hipV: clampInt(raw.hipV, -8, 8),
    knee: [
      clampComp(raw.knee[0]),
      clampComp(raw.knee[1]),
      clampComp(raw.knee[2])
    ] as LegFrameOffset,
    foot: [
      clampComp(raw.foot[0]),
      clampComp(raw.foot[1]),
      clampComp(raw.foot[2])
    ] as LegFrameOffset,
    ...(raw.tarsus
      ? {
          tarsus: [
            clampComp(raw.tarsus[0]),
            clampComp(raw.tarsus[1]),
            clampComp(raw.tarsus[2])
          ] as LegFrameOffset
        }
      : {}),
    femurRib: Boolean(raw.femurRib)
  };
}

export function cloneArticulatedLeg2(leg: ArticulatedLeg2): ArticulatedLeg2 {
  const out: ArticulatedLeg2 = {
    ...leg,
    knee: [leg.knee[0], leg.knee[1], leg.knee[2]] as LegFrameOffset,
    foot: [leg.foot[0], leg.foot[1], leg.foot[2]] as LegFrameOffset
  };
  if (leg.tarsus) {
    out.tarsus = [leg.tarsus[0], leg.tarsus[1], leg.tarsus[2]] as LegFrameOffset;
  }
  return out;
}
