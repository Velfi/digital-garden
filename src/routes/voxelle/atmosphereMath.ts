/**
 * Planar atmosphere fog: plane n·x + c = 0 (n unit), distance-based fog factor.
 * Shared reference for GLSL/TSL and unit tests.
 */

export type AtmosphereMode = 'slab' | 'positiveSide';

/** Unit normal and plane constant so n·p + c = 0 for point p on plane. */
export type AtmospherePlane = {
  nx: number;
  ny: number;
  nz: number;
  c: number;
};

export function planeFromPointAndNormal(
  px: number,
  py: number,
  pz: number,
  nx: number,
  ny: number,
  nz: number
): AtmospherePlane {
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-10) {
    return { nx: 0, ny: 1, nz: 0, c: 0 };
  }
  const ux = nx / len;
  const uy = ny / len;
  const uz = nz / len;
  const c = -(ux * px + uy * py + uz * pz);
  return { nx: ux, ny: uy, nz: uz, c };
}

/** Signed distance from point to plane (positive = on +n side if n points outward). */
export function signedDistanceToPlane(
  x: number,
  y: number,
  z: number,
  plane: AtmospherePlane
): number {
  return plane.nx * x + plane.ny * y + plane.nz * z + plane.c;
}

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Soft band across the plane for +normal mode (world units). */
export function atmospherePlaneSoftness(thickness: number): number {
  return Math.max(0.5, thickness * 0.15);
}

/**
 * Fog amount in [0, 1] from signed distance to the plane (matches GLSL planar branch).
 * Slab: Gaussian in |sd| (no hard outer edge). +normal: smooth plane crossing × exponential decay above.
 */
export function fogFactorFromDistance(
  signedDist: number,
  thickness: number,
  density: number,
  mode: AtmosphereMode
): number {
  const d = Math.abs(density);
  const t = Math.max(1e-4, thickness);
  if (mode === 'slab') {
    const u = Math.abs(signedDist) / t;
    const fogShape = Math.exp(-u * u);
    return Math.min(1, Math.max(0, fogShape * d));
  }
  const soft = atmospherePlaneSoftness(t);
  const planeMask = smoothstep01(-soft, 0, signedDist);
  const h = Math.max(0, signedDist);
  const fogShape = planeMask * Math.exp(-h / t);
  return Math.min(1, Math.max(0, fogShape * d));
}

/**
 * Exponential distance fog along view axis (matches GLSL aerial branch). `viewDist` = distance in front of camera.
 */
export function fogFactorFromViewDistance(
  viewDist: number,
  thickness: number,
  density: number
): number {
  const t = Math.max(1e-4, thickness);
  const vz = Math.max(0, viewDist);
  const fogShape = 1 - Math.exp(-vz / t);
  const d = Math.abs(density);
  return Math.min(1, Math.max(0, fogShape * d));
}
