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

/** Ray trace backend selection (explicit, no auto mode). */
export type RayTraceBackendPreference = 'gpu' | 'cpu';

export function isRayTraceBackendPreference(v: unknown): v is RayTraceBackendPreference {
  return v === 'gpu' || v === 'cpu';
}

export const DEFAULT_RAY_TRACE_BACKEND: RayTraceBackendPreference = 'gpu';

export type VoxellePreferences = {
  /** Δx,Δy,Δz tooltip following the pointer during sculpt strokes (branch, depth adjust, etc.). */
  showMovementDeltaHint: boolean;
  /** Line + numeric label at the original centroid while moving the selection with the move gizmo. */
  showDragDeltaHint: boolean;
  /** HDR → display tone mapping for the main viewport (and bloom OutputPass). */
  toneMapping: ToneMappingPreference;
  /**
   * Which graphics API to use. Takes effect after reload (see Preferences modal).
   * `auto` tries WebGPU first, then WebGL.
   */
  rendererBackend: RendererBackendPreference;
  /** Viewport frames-per-second overlay (top-left). */
  showFpsCounter: boolean;
  /** Optional cap for internal render pixel ratio. 0 uses full device pixel ratio. */
  maxPixelRatio: number;
  /** Ray mode: `gpu` runs GPU TSL only; `cpu` runs progressive CPU only. */
  rayTraceBackend: RayTraceBackendPreference;
  /** Ray mode: max main-thread ms per frame for CPU progressive (4–32). */
  rayTickBudgetMs: number;
  /** Ray mode: max internal trace buffer dimension (512–1920). */
  rayMaxBufferDim: number;
  /** Ray mode: temporal AA sample cap for CPU progressive (1–64). */
  rayMaxTemporalSamples: number;
  /** Ray mode: soft shadow rays per shaded point when not in coarse CPU pass (1–8). */
  rayShadowSamples: number;
};

const DEFAULTS: VoxellePreferences = {
  showMovementDeltaHint: false,
  showDragDeltaHint: true,
  toneMapping: DEFAULT_TONE_MAPPING_PREFERENCE,
  rendererBackend: DEFAULT_RENDERER_BACKEND,
  showFpsCounter: false,
  maxPixelRatio: 0,
  rayTraceBackend: DEFAULT_RAY_TRACE_BACKEND,
  rayTickBudgetMs: 12,
  rayMaxBufferDim: 1920,
  rayMaxTemporalSamples: 64,
  rayShadowSamples: 8
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
        typeof o.showDragDeltaHint === 'boolean' ? o.showDragDeltaHint : DEFAULTS.showDragDeltaHint,
      toneMapping: isToneMappingPreference(o.toneMapping) ? o.toneMapping : DEFAULTS.toneMapping,
      rendererBackend: isRendererBackendPreference(o.rendererBackend)
        ? o.rendererBackend
        : DEFAULTS.rendererBackend,
      showFpsCounter:
        typeof o.showFpsCounter === 'boolean' ? o.showFpsCounter : DEFAULTS.showFpsCounter,
      maxPixelRatio:
        typeof o.maxPixelRatio === 'number' &&
        Number.isFinite(o.maxPixelRatio) &&
        o.maxPixelRatio >= 0
          ? o.maxPixelRatio
          : DEFAULTS.maxPixelRatio,
      rayTraceBackend:
        o.rayTraceBackend === 'auto'
          ? 'gpu'
          : isRayTraceBackendPreference(o.rayTraceBackend)
            ? o.rayTraceBackend
            : DEFAULTS.rayTraceBackend,
      rayTickBudgetMs:
        typeof o.rayTickBudgetMs === 'number' &&
        Number.isFinite(o.rayTickBudgetMs) &&
        o.rayTickBudgetMs >= 4 &&
        o.rayTickBudgetMs <= 32
          ? Math.round(o.rayTickBudgetMs)
          : DEFAULTS.rayTickBudgetMs,
      rayMaxBufferDim:
        typeof o.rayMaxBufferDim === 'number' &&
        Number.isFinite(o.rayMaxBufferDim) &&
        o.rayMaxBufferDim >= 512 &&
        o.rayMaxBufferDim <= 1920
          ? Math.round(o.rayMaxBufferDim)
          : DEFAULTS.rayMaxBufferDim,
      rayMaxTemporalSamples:
        typeof o.rayMaxTemporalSamples === 'number' &&
        Number.isFinite(o.rayMaxTemporalSamples) &&
        o.rayMaxTemporalSamples >= 1 &&
        o.rayMaxTemporalSamples <= 64
          ? Math.round(o.rayMaxTemporalSamples)
          : DEFAULTS.rayMaxTemporalSamples,
      rayShadowSamples:
        typeof o.rayShadowSamples === 'number' &&
        Number.isFinite(o.rayShadowSamples) &&
        o.rayShadowSamples >= 1 &&
        o.rayShadowSamples <= 8
          ? Math.round(o.rayShadowSamples)
          : DEFAULTS.rayShadowSamples
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
