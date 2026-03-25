import type { ArticulatedLeg2 } from '../articulatedLeg';

/** Default bee legs (also used when clamping options with missing leg fields). */
export const INSECTA_INITIAL_LEGS: {
  front: ArticulatedLeg2;
  mid: ArticulatedLeg2;
  hind: ArticulatedLeg2;
} = {
  front: {
    enabled: true,
    hipU: 4,
    hipV: 0,
    knee: [1, 2, -3],
    foot: [1, 2, -5],
    femurRib: false
  },
  mid: {
    enabled: true,
    hipU: 0,
    hipV: 0,
    knee: [1, 2, -4],
    foot: [1, 2, -5],
    femurRib: false
  },
  hind: {
    enabled: true,
    hipU: -4,
    hipV: 0,
    knee: [0, 1, -3],
    foot: [1, 1, -5],
    femurRib: false
  }
};
