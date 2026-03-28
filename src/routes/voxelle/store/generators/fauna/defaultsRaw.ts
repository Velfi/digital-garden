import type { GenerateFaunaOptions } from './types';

/**
 * Morph + limb end/pole presets only. `limbMids` / `limbDistals` are filled in `presets.ts`
 * via `deriveLimbJointLocalsForOptions` to avoid importing the full voxel pipeline in a cycle.
 */
export const RAW_FAUNA_DEFAULTS: Record<'quadruped' | 'biped', Omit<GenerateFaunaOptions, 'limbMids' | 'limbDistals'>> =
  {
    quadruped: {
      stance: 'quadruped',
      archetype: 'ungulate',
      autoFootPlacement: false,
      anchorOffsetU: 0,
      anchorOffsetV: 0,
      bodyYaw: 0,
      bodyArch: 0.02,
      spineSegments: 7,
      bodyDims: { length: 17, halfWidth: 2, halfHeight: 3 },
      neckDims: { length: 8, halfWidth: 2, halfHeight: 3 },
      headDims: { length: 6, halfWidth: 2, halfHeight: 3 },
      tailLength: 1,
      shoulderOffsetForward: 3,
      hipOffsetForward: -3,
      frontUpperLength: 7,
      frontLowerLength: 7,
      hindUpperLength: 8,
      hindLowerLength: 8,
      // Local space from anchor center: +F toward head, +S side, +U up. Feet must sit under
      // shoulders (~bodyDims.length + shoulderOffsetForward along F); small F was placing feet
      // behind the chest and forcing front legs to angle backward.
      limbTargets: {
        frontLeft: [20, -2.1, -19],
        frontRight: [20, 2.1, -19],
        hindLeft: [-3.5, -2.2, -20],
        hindRight: [-3.5, 2.2, -20]
      },
      limbPoles: {
        frontLeft: [20, -2.4, 0.6],
        frontRight: [20, 2.4, 0.6],
        hindLeft: [1.8, -2.8, 1.2],
        hindRight: [1.8, 2.8, 1.2]
      },
      spinePose: {
        chest: [0, 0, 0],
        neck: [0, 0, 0],
        head: [0, 0, 0]
      }
    },
    biped: {
      stance: 'biped',
      archetype: 'plantigrade',
      autoFootPlacement: false,
      anchorOffsetU: 0,
      anchorOffsetV: 0,
      bodyYaw: 0,
      bodyArch: 0.015,
      spineSegments: 6,
      bodyDims: { length: 11, halfWidth: 4, halfHeight: 4 },
      neckDims: { length: 5, halfWidth: 4, halfHeight: 4 },
      headDims: { length: 2, halfWidth: 4, halfHeight: 4 },
      tailLength: 0,
      shoulderOffsetForward: 0,
      hipOffsetForward: -1,
      frontUpperLength: 4,
      frontLowerLength: 3,
      hindUpperLength: 7,
      hindLowerLength: 6,
      limbTargets: {
        frontLeft: [0.5, -3.5, -5],
        frontRight: [0.5, 3.5, -5],
        hindLeft: [1, -2.5, -10],
        hindRight: [1, 2.5, -10]
      },
      limbPoles: {
        frontLeft: [-2, -3.5, -1],
        frontRight: [-2, 3.5, -1],
        hindLeft: [2, -2.5, -3.5],
        hindRight: [2, 2.5, -3.5]
      },
      spinePose: {
        chest: [0, 0, 0],
        neck: [0, 0, 0],
        head: [0, 0, 0]
      }
    }
  };
