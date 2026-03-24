import type { FishSpeciesId } from '../../../core';
import type { PiscinaPectoralParams } from '../types';

const DEFAULT: PiscinaPectoralParams = {
  reachMul: 1,
  envelopeMul: 1,
  fanRows: 2,
  uFanScale: 1,
  trailPerRow: 0.35,
  trailAlongStep: 0,
  rootBellyBias: 0,
  kernelPinch: 1.22,
  lateralAttachMul: 0.88,
  ventralDropAdd: 0.09,
  hangBackDeg: 6,
  hangDownDeg: 8
};

const OVERRIDES: Partial<Record<FishSpeciesId, Partial<PiscinaPectoralParams>>> = {
  bass: {
    reachMul: 0.58,
    envelopeMul: 0.54,
    fanRows: 2,
    uFanScale: 0.99,
    trailPerRow: 0.33,
    trailAlongStep: 0.02,
    rootBellyBias: 0.08,
    kernelPinch: 1.12,
    lateralAttachMul: 0.89,
    ventralDropAdd: 0.11,
    hangBackDeg: 6,
    hangDownDeg: 8
  },
  trout: {
    reachMul: 0.56,
    envelopeMul: 0.52,
    fanRows: 2,
    uFanScale: 0.94,
    trailPerRow: 0.32,
    trailAlongStep: 0.01,
    rootBellyBias: 0.07,
    kernelPinch: 1.14,
    lateralAttachMul: 0.9,
    ventralDropAdd: 0.1,
    hangBackDeg: 6,
    hangDownDeg: 8
  },
  goldfish: {
    reachMul: 0.52,
    envelopeMul: 0.42,
    fanRows: 2,
    uFanScale: 0.82,
    trailPerRow: 0.24,
    trailAlongStep: 0.016,
    rootBellyBias: 0.12,
    kernelPinch: 1.3
  },
  tuna: {
    reachMul: 0.46,
    envelopeMul: 0.4,
    fanRows: 2,
    uFanScale: 0.82,
    trailPerRow: 0.26,
    trailAlongStep: 0.018,
    rootBellyBias: 0.14,
    kernelPinch: 1.3,
    lateralAttachMul: 0.84,
    ventralDropAdd: 0.12,
    hangBackDeg: 8,
    hangDownDeg: 7
  },
  eel: {
    reachMul: 0.18,
    envelopeMul: 0.16,
    fanRows: 2,
    uFanScale: 0.56,
    trailPerRow: 0.14,
    trailAlongStep: 0,
    rootBellyBias: 0,
    kernelPinch: 1.18,
    lateralAttachMul: 0.92,
    ventralDropAdd: 0.03,
    hangBackDeg: 4,
    hangDownDeg: 6
  }
};

export function getPiscinaPectoralParams(species: FishSpeciesId): PiscinaPectoralParams {
  const o = OVERRIDES[species];
  if (!o) return { ...DEFAULT };
  return {
    reachMul: o.reachMul ?? DEFAULT.reachMul,
    envelopeMul: o.envelopeMul ?? DEFAULT.envelopeMul,
    fanRows: o.fanRows ?? DEFAULT.fanRows,
    uFanScale: o.uFanScale ?? DEFAULT.uFanScale,
    trailPerRow: o.trailPerRow ?? DEFAULT.trailPerRow,
    trailAlongStep: o.trailAlongStep ?? DEFAULT.trailAlongStep,
    rootBellyBias: o.rootBellyBias ?? DEFAULT.rootBellyBias,
    kernelPinch: o.kernelPinch ?? DEFAULT.kernelPinch,
    lateralAttachMul: o.lateralAttachMul ?? DEFAULT.lateralAttachMul,
    ventralDropAdd: o.ventralDropAdd ?? DEFAULT.ventralDropAdd,
    hangBackDeg: o.hangBackDeg ?? DEFAULT.hangBackDeg,
    hangDownDeg: o.hangDownDeg ?? DEFAULT.hangDownDeg
  };
}
