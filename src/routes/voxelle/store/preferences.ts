import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import {
  DEFAULT_TONE_MAPPING_PREFERENCE,
  isToneMappingPreference,
  type ToneMappingPreference
} from '../toneMappingPreference';

const VOXELLE_PREFERENCES_KEY = 'voxelle-preferences';

/** Viewport API: WebGL, WebGPU when supported, or auto (prefer WebGPU). */
export type RendererBackendPreference = 'auto' | 'webgpu' | 'webgl';

export function isRendererBackendPreference(v: unknown): v is RendererBackendPreference {
  return v === 'auto' || v === 'webgpu' || v === 'webgl';
}

export const DEFAULT_RENDERER_BACKEND: RendererBackendPreference = 'auto';

export type VoxellePreferences = {
  /** Δx,Δy,Δz tooltip following the pointer during sculpt strokes (branch, depth adjust, etc.). */
  showMovementDeltaHint: boolean;
  /** Line + numeric label at the original centroid while moving the selection with the move gizmo. */
  showDragDeltaHint: boolean;
  /** When true, move/rotate gizmos skip occluded-pass tint and draw fully on top of the scene. */
  gizmosAlwaysOnTop: boolean;
  /** HDR → display tone mapping for the main viewport (and bloom OutputPass). */
  toneMapping: ToneMappingPreference;
  /**
   * Which graphics API to use. Takes effect after reload (see Preferences modal).
   * `auto` tries WebGPU first, then WebGL.
   */
  rendererBackend: RendererBackendPreference;
  /** Viewport frames-per-second overlay (top-left). */
  showFpsCounter: boolean;
};

const DEFAULTS: VoxellePreferences = {
  showMovementDeltaHint: false,
  showDragDeltaHint: true,
  gizmosAlwaysOnTop: false,
  toneMapping: DEFAULT_TONE_MAPPING_PREFERENCE,
  rendererBackend: DEFAULT_RENDERER_BACKEND,
  showFpsCounter: false
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
      toneMapping: isToneMappingPreference(o.toneMapping) ? o.toneMapping : DEFAULTS.toneMapping,
      rendererBackend: isRendererBackendPreference(o.rendererBackend)
        ? o.rendererBackend
        : DEFAULTS.rendererBackend,
      showFpsCounter:
        typeof o.showFpsCounter === 'boolean' ? o.showFpsCounter : DEFAULTS.showFpsCounter
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
