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

const defaultPlane: AtmospherePlane = { nx: 0, ny: 1, nz: 0, c: 0 };

export const atmospherePlane = writable<AtmospherePlane>({ ...defaultPlane });
export const atmospherePlaneValid = writable<boolean>(false);

export const atmosphereActiveForRender = derived(
  [atmosphereEnabled, atmosphereSpatialMode, atmospherePlaneValid],
  ([on, spatial, valid]) => on && (spatial === 'aerial' || valid)
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
