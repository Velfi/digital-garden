import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import {
  DEFAULT_TONE_MAPPING_PREFERENCE,
  isToneMappingPreference,
  type ToneMappingPreference
} from '../toneMappingPreference';

const VOXELLE_PREFERENCES_KEY = 'voxelle-preferences';

export type VoxellePreferences = {
  /** Δx,Δy,Δz tooltip following the pointer during sculpt strokes (branch, depth adjust, etc.). */
  showMovementDeltaHint: boolean;
  /** Line + numeric label at the original centroid while moving the selection with the move gizmo. */
  showDragDeltaHint: boolean;
  /** When true, move/rotate gizmos skip occluded-pass tint and draw fully on top of the scene. */
  gizmosAlwaysOnTop: boolean;
  /** HDR → display tone mapping for the main viewport (and bloom OutputPass). */
  toneMapping: ToneMappingPreference;
};

const DEFAULTS: VoxellePreferences = {
  showMovementDeltaHint: false,
  showDragDeltaHint: true,
  gizmosAlwaysOnTop: false,
  toneMapping: DEFAULT_TONE_MAPPING_PREFERENCE
};

export function loadPreferences(): VoxellePreferences {
  if (!browser) return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(VOXELLE_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') return { ...DEFAULTS };
    const o = data as Record<string, unknown>;
    return {
      showMovementDeltaHint:
        typeof o.showMovementDeltaHint === 'boolean'
          ? o.showMovementDeltaHint
          : DEFAULTS.showMovementDeltaHint,
      showDragDeltaHint:
        typeof o.showDragDeltaHint === 'boolean'
          ? o.showDragDeltaHint
          : DEFAULTS.showDragDeltaHint,
      gizmosAlwaysOnTop:
        typeof o.gizmosAlwaysOnTop === 'boolean'
          ? o.gizmosAlwaysOnTop
          : DEFAULTS.gizmosAlwaysOnTop,
      toneMapping: isToneMappingPreference(o.toneMapping) ? o.toneMapping : DEFAULTS.toneMapping
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Reactive copy of saved preferences; subscribe in components, update via `savePreferences`. */
export const voxellePreferences = writable<VoxellePreferences>(
  browser ? loadPreferences() : { ...DEFAULTS }
);

export function savePreferences(prefs: VoxellePreferences) {
  if (!browser) return;
  try {
    localStorage.setItem(VOXELLE_PREFERENCES_KEY, JSON.stringify(prefs));
    voxellePreferences.set(prefs);
  } catch {
    // ignore
  }
}
