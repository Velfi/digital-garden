export type FaunaStanceId = 'quadruped' | 'biped';
export type FaunaArchetypeId = 'plantigrade' | 'digitigrade' | 'ungulate';

export type FaunaLimbId = 'frontLeft' | 'frontRight' | 'hindLeft' | 'hindRight';

export type FaunaVec3 = [number, number, number];

export type FaunaPoseTargets = Record<FaunaLimbId, FaunaVec3>;
export type FaunaPosePoles = Record<FaunaLimbId, FaunaVec3>;
/** Elbow / knee (first joint out from shoulder/hip). */
export type FaunaPoseMids = Record<FaunaLimbId, FaunaVec3>;
/** Wrist / ankle (second joint; tip remains limbTargets). */
export type FaunaPoseDistals = Record<FaunaLimbId, FaunaVec3>;

/** Chest / neck / head offsets in creature-local space (F, S, U), voxels; applied in `resolveFaunaSpinePosedOrigins`. */
export type FaunaSpinePose = {
  chest: FaunaVec3;
  neck: FaunaVec3;
  head: FaunaVec3;
};

/** Per-section size in creature frame: forward (spine), side (lateral half-extent), up (vertical half-extent), voxels. */
export type FaunaSectionDims = {
  /** Along spine toward head (F). */
  length: number;
  /** Half-extent left–right (S). */
  halfWidth: number;
  /** Half-extent vertical (U). */
  halfHeight: number;
};

export type GenerateFaunaOptions = {
  stance: FaunaStanceId;
  archetype: FaunaArchetypeId;
  /** When true (quadruped), limb targets/poles are derived from torso + shoulder/hip so feet stay under girdles. */
  autoFootPlacement: boolean;
  anchorOffsetU: number;
  anchorOffsetV: number;
  bodyYaw: number;
  bodyArch: number;
  spineSegments: number;
  /** Trunk: spine length + torso bulk cross-section. */
  bodyDims: FaunaSectionDims;
  /** Neck segment length and cross-section. */
  neckDims: FaunaSectionDims;
  /** Head segment length and cross-section. */
  headDims: FaunaSectionDims;
  tailLength: number;
  shoulderOffsetForward: number;
  hipOffsetForward: number;
  frontUpperLength: number;
  frontLowerLength: number;
  hindUpperLength: number;
  hindLowerLength: number;
  limbTargets: FaunaPoseTargets;
  limbPoles: FaunaPosePoles;
  limbMids: FaunaPoseMids;
  limbDistals: FaunaPoseDistals;
  spinePose: FaunaSpinePose;
};

