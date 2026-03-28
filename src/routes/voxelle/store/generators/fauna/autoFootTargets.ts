import type { FaunaPosePoles, FaunaPoseTargets, GenerateFaunaOptions } from './types';
import { getFaunaCenterLift } from './limbKinematics';

/**
 * Feet in creature-local space from anchor center: +F toward head, +S side, +U up.
 * Places hooves/paws under shoulder/hip lines using the same horizontal offsets as `limbRootFor`,
 * and vertical offset matching `getFaunaCenterLift` so legs reach the ground plane.
 */
export function deriveQuadrupedAutoFootTargets(o: GenerateFaunaOptions): {
  limbTargets: FaunaPoseTargets;
  limbPoles: FaunaPosePoles;
} {
  const lift = getFaunaCenterLift(o);
  const footU = -lift;
  const segCount = Math.max(2, Math.floor(o.spineSegments));
  const step = Math.max(1, o.bodyDims.length / segCount);
  const chestForward = segCount * step;
  const shoulderF = chestForward + o.shoulderOffsetForward;
  const hipF = o.hipOffsetForward;
  const frontSide = o.bodyDims.halfWidth * 0.82;
  const hindSide = o.bodyDims.halfWidth * 0.84;

  const limbTargets: FaunaPoseTargets = {
    frontLeft: [shoulderF, -frontSide, footU],
    frontRight: [shoulderF, frontSide, footU],
    hindLeft: [hipF, -hindSide, footU],
    hindRight: [hipF, hindSide, footU]
  };

  const limbPoles: FaunaPosePoles = {
    frontLeft: [shoulderF * 0.38, -frontSide * 0.92, 0.85],
    frontRight: [shoulderF * 0.38, frontSide * 0.92, 0.85],
    hindLeft: [Math.max(-1, hipF + 2.2), -hindSide * 0.92, 1.05],
    hindRight: [Math.max(-1, hipF + 2.2), hindSide * 0.92, 1.05]
  };

  return { limbTargets, limbPoles };
}
