import { writable, derived } from 'svelte/store';
import type { AtmosphereMode, AtmospherePlane } from '../atmosphereMath';
import { planeFromPointAndNormal } from '../atmosphereMath';

export type { AtmosphereMode, AtmospherePlane };

/** `plane`: fog from a clicked face plane. `aerial`: exponential fog from camera depth (no face click). */
export type AtmosphereSpatialMode = 'plane' | 'aerial';

export const atmosphereEnabled = writable<boolean>(false);
export const atmosphereColor = writable<string>('#c8d4e0');
/**
 * World units (planar): controls how fast fog fades with distance from the plane.
 * Aerial mode: scale distance for exp falloff; larger = thinner air.
 */
export const atmosphereThickness = writable<number>(28);
/** 0..1 scales peak fog amount. */
export const atmosphereDensity = writable<number>(0.85);
export const atmosphereMode = writable<AtmosphereMode>('positiveSide');

export const atmosphereSpatialMode = writable<AtmosphereSpatialMode>('aerial');
/** Height shaping for mist-like atmosphere (0 = no altitude bias). */
export const atmosphereHeightBias = writable<number>(0);
/** World units; lower values make mist hug a height band more tightly. */
export const atmosphereHeightFalloff = writable<number>(120);
export const atmosphereDriftEnabled = writable<boolean>(false);
/** 0..1 amount of drifting/noise modulation. */
export const atmosphereDriftAmount = writable<number>(0.2);
/** World scale for drift noise pattern. */
export const atmosphereDriftScale = writable<number>(0.02);
/** Animation speed scalar for drift. */
export const atmosphereDriftSpeed = writable<number>(0.2);

const defaultPlane: AtmospherePlane = { nx: 0, ny: 1, nz: 0, c: 0 };

export const atmospherePlane = writable<AtmospherePlane>({ ...defaultPlane });
export const atmospherePlaneValid = writable<boolean>(false);

export const atmosphereActiveForRender = derived(
  [atmosphereEnabled, atmosphereSpatialMode, atmospherePlaneValid],
  ([on, spatial, valid]) => on && (spatial === 'aerial' || valid)
);

export const distanceTintEnabled = writable<boolean>(false);
export const distanceTintNearColor = writable<string>('#ffffff');
export const distanceTintMidColor = writable<string>('#c8d4e0');
export const distanceTintFarColor = writable<string>('#8fa3bf');
export const distanceTintNearDistance = writable<number>(16);
export const distanceTintFarDistance = writable<number>(140);
export const distanceTintStrength = writable<number>(0.6);
export const distanceTintActiveForRender = derived(distanceTintEnabled, (on) => on);

export const grainEnabled = writable<boolean>(false);
export const grainStrength = writable<number>(0.12);
export const grainAnimated = writable<boolean>(true);
export const grainSpeed = writable<number>(1);
export const grainActiveForRender = derived([grainEnabled, grainStrength], ([on, s]) => on && s > 0);

export const sunShaftsEnabled = writable<boolean>(false);
export const sunShaftsStrength = writable<number>(0.7);
export const sunShaftsDecay = writable<number>(0.92);
export const sunShaftsDensity = writable<number>(0.8);
export const sunShaftsWeight = writable<number>(0.6);
export const sunShaftsSamples = writable<number>(18);
export const sunShaftsActiveForRender = derived(
  [sunShaftsEnabled, sunShaftsStrength],
  ([on, s]) => on && s > 0
);

export function setAtmospherePlaneFromWorldPointAndNormal(
  px: number,
  py: number,
  pz: number,
  nx: number,
  ny: number,
  nz: number
): void {
  atmospherePlane.set(planeFromPointAndNormal(px, py, pz, nx, ny, nz));
  atmospherePlaneValid.set(true);
}

export function clearAtmospherePlane(): void {
  atmospherePlane.set({ ...defaultPlane });
  atmospherePlaneValid.set(false);
}
