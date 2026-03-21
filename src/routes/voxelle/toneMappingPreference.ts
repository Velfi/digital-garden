import * as THREE from 'three';

export const TONE_MAPPING_PREFERENCE_IDS = [
  'neutral',
  'aces',
  'linear',
  'none',
  'agx',
  'reinhard'
] as const;

export type ToneMappingPreference = (typeof TONE_MAPPING_PREFERENCE_IDS)[number];

export const DEFAULT_TONE_MAPPING_PREFERENCE: ToneMappingPreference = 'neutral';

export function isToneMappingPreference(value: unknown): value is ToneMappingPreference {
  return typeof value === 'string' && (TONE_MAPPING_PREFERENCE_IDS as readonly string[]).includes(value);
}

/** Labels for Preferences UI (short descriptions). */
export const TONE_MAPPING_OPTIONS: readonly { value: ToneMappingPreference; label: string }[] = [
  { value: 'neutral', label: 'Neutral (balanced)' },
  { value: 'aces', label: 'ACES Filmic' },
  { value: 'linear', label: 'Linear' },
  { value: 'none', label: 'None' },
  { value: 'agx', label: 'AgX' },
  { value: 'reinhard', label: 'Reinhard' }
];

export function toneMappingPreferenceToThree(p: ToneMappingPreference): THREE.ToneMapping {
  switch (p) {
    case 'neutral':
      return THREE.NeutralToneMapping;
    case 'aces':
      return THREE.ACESFilmicToneMapping;
    case 'linear':
      return THREE.LinearToneMapping;
    case 'none':
      return THREE.NoToneMapping;
    case 'agx':
      return THREE.AgXToneMapping;
    case 'reinhard':
      return THREE.ReinhardToneMapping;
    default:
      return THREE.NeutralToneMapping;
  }
}
