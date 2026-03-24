import type { FaceNormal, FishSpeciesId } from '../../core';

export type GeneratePiscinaOptions = {
  species: FishSpeciesId;
  length: number;
  width: number;
  thickness: number;
  finDorsal: number;
  finAnal: number;
  finCaudal: number;
  finPectoral: number;
  anchorOffsetU: number;
  anchorOffsetV: number;
  /** -1…1 lateral bend amplitude (pipeline scales by W). */
  spineBend: number;
  /** -1…1 secondary lateral / vertical wave. */
  spineSCurve: number;
  /** Fin orientations in degrees (-45…45), applied in local body frame at fin anchor. */
  finDorsalPitch: number;
  finDorsalSweep: number;
  finAnalPitch: number;
  finCaudalSpread: number;
  finPectoralCant: number;
};

export type PiscinaPresetNumericFields = {
  length: number;
  /** Half-width along the lateral tangent (pectoral line). */
  width: number;
  /** Half-thickness along the face normal (belly ↔ back). */
  thickness: number;
  finDorsal: number;
  finAnal: number;
  finCaudal: number;
  finPectoral: number;
  anchorOffsetU: number;
  anchorOffsetV: number;
};

export type SpeciesOutlineFn = (t: number, W: number, T: number) => { halfSide: number; halfUp: number };

export type PiscinaFrame = {
  forward: FaceNormal;
  side: FaceNormal;
  up: FaceNormal;
  center: [number, number, number];
};
