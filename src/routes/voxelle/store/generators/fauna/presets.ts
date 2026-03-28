import type { FaunaVec3, GenerateFaunaOptions } from './types';
import { RAW_FAUNA_DEFAULTS } from './defaultsRaw';
import { deriveLimbJointLocalsForOptions } from './deriveLimbJoints';

function withDerivedJoints(
  o: Omit<GenerateFaunaOptions, 'limbMids' | 'limbDistals'>
): GenerateFaunaOptions {
  const z: FaunaVec3 = [0, 0, 0];
  const ej = { frontLeft: z, frontRight: z, hindLeft: z, hindRight: z };
  const { limbMids, limbDistals } = deriveLimbJointLocalsForOptions({ ...o, limbMids: ej, limbDistals: ej });
  return { ...o, limbMids, limbDistals };
}

export const FAUNA_DEFAULTS: Record<'quadruped' | 'biped', GenerateFaunaOptions> = {
  quadruped: withDerivedJoints(RAW_FAUNA_DEFAULTS.quadruped),
  biped: withDerivedJoints(RAW_FAUNA_DEFAULTS.biped)
};
