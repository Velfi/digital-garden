import { writable } from 'svelte/store';

export type SquishyMode = 'add' | 'edit' | 'delete';

export type SquishyMetaball = {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
};

export const squishyMode = writable<SquishyMode>('add');
export const squishyMetaballs = writable<SquishyMetaball[]>([]);
export const squishySelectedId = writable<string | null>(null);
export const squishyDefaultRadius = writable<number>(4);
/** Add mode: place like draw brush snap — adjacent air cell plus round(radius) along face normal so the ball rests on the surface. When false, center on the surface voxel cell. */
export const squishyAddSnapToSurface = writable<boolean>(true);
/** Voxelize metaballs as a shell (outer layers only), like plane/cuboid hollow. */
export const squishyHollow = writable<boolean>(false);
/** Layers kept from the outer air interface (6-neighborhood); 1 = thinnest shell. */
export const squishyHollowWallThickness = writable<number>(1);

function createSquishyId(): string {
  return `squishy-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSquishyMetaball(
  x: number,
  y: number,
  z: number,
  radius: number
): SquishyMetaball {
  return {
    id: createSquishyId(),
    x: Math.round(x),
    y: Math.round(y),
    z: Math.round(z),
    radius: Math.max(0.5, radius)
  };
}

export function resetSquishySession(): void {
  squishyMetaballs.set([]);
  squishySelectedId.set(null);
  squishyMode.set('add');
  squishyHollow.set(false);
  squishyHollowWallThickness.set(1);
}
