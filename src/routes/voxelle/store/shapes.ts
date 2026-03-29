import { coordKey, parseCoordKey } from '../coordUtils';
import type { Voxel } from '../voxelMaterial';

export type GridSize = number;
export type StartShape = 'cube' | 'orb' | 'cylinder' | 'hollowCube' | 'plane' | 'circle' | 'empty';

const DEFAULT_COLOR = 0x888888;

function getBounds(size: number) {
  const lo = -Math.floor(size / 2);
  const hi = Math.floor((size - 1) / 2);
  return { lo, hi };
}

export function initShape(
  size: GridSize,
  shape: StartShape,
  color: number = DEFAULT_COLOR
): Map<string, Voxel> {
  const voxel: Voxel = { color: color & 0xffffff, material: 'plastic' };
  const map = new Map<string, Voxel>();
  if (size < 1) return map;
  const { lo, hi } = getBounds(size);

  if (shape === 'empty') return map;

  const r = (size - 1) / 2;
  const rSq = r * r;

  for (let x = lo; x <= hi; x++) {
    for (let y = lo; y <= hi; y++) {
      for (let z = lo; z <= hi; z++) {
        let include = false;
        if (shape === 'cube') {
          include = true;
        } else if (shape === 'orb') {
          include = x * x + y * y + z * z <= rSq;
        } else if (shape === 'cylinder') {
          include = x * x + z * z <= rSq;
        } else if (shape === 'hollowCube') {
          const onFace = x === lo || x === hi || y === lo || y === hi || z === lo || z === hi;
          include = onFace;
        } else if (shape === 'plane') {
          include = y === 0;
        } else if (shape === 'circle') {
          include = y === 0 && x * x + z * z <= rSq;
        }
        if (include) map.set(coordKey(x, y, z), { ...voxel });
      }
    }
  }
  return map;
}

export function initFilledCube(size: GridSize, color: number = DEFAULT_COLOR): Map<string, Voxel> {
  return initShape(size, 'cube', color);
}

function rotateX([x, y, z]: [number, number, number], quarters: number): [number, number, number] {
  let out: [number, number, number] = [x, y, z];
  for (let i = 0; i < (quarters & 3); i++) {
    out = [out[0], -out[2], out[1]];
  }
  return out;
}

function rotateY([x, y, z]: [number, number, number], quarters: number): [number, number, number] {
  let out: [number, number, number] = [x, y, z];
  for (let i = 0; i < (quarters & 3); i++) {
    out = [out[2], out[1], -out[0]];
  }
  return out;
}

function rotateZ([x, y, z]: [number, number, number], quarters: number): [number, number, number] {
  let out: [number, number, number] = [x, y, z];
  for (let i = 0; i < (quarters & 3); i++) {
    out = [-out[1], out[0], out[2]];
  }
  return out;
}

/** Clamp UI / store rotation to quarter-turns 0–3 (90° steps). */
export function clampQuarterTurn(n: number): 0 | 1 | 2 | 3 {
  return (Math.max(0, Math.min(3, Math.floor(n))) & 3) as 0 | 1 | 2 | 3;
}

/** 90° steps about +X, +Y, or +Z through the origin. `quarters` may be negative. */
export function rotateVectorByAxisQuarters(
  v: [number, number, number],
  axis: 0 | 1 | 2,
  quarters: number
): [number, number, number] {
  let q = quarters % 4;
  if (q < 0) q += 4;
  if (q === 0) return [v[0], v[1], v[2]];
  if (axis === 0) return rotateX(v, q);
  if (axis === 1) return rotateY(v, q);
  return rotateZ(v, q);
}

export type AddShapeParams = {
  position: [number, number, number];
  rotation: [number, number, number];
  shape: StartShape;
  size: number;
  getVoxel: (x: number, y: number, z: number) => Voxel;
  /** When false, only empty cells are filled (per primary + mirror keys). Default true. */
  overwriteIntersecting?: boolean;
};

function rotateXRad([x, y, z]: [number, number, number], rad: number): [number, number, number] {
  if (Math.abs(rad) < 1e-9) return [x, y, z];
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [x, y * c - z * s, y * s + z * c];
}

function rotateYRad([x, y, z]: [number, number, number], rad: number): [number, number, number] {
  if (Math.abs(rad) < 1e-9) return [x, y, z];
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotateZRad([x, y, z]: [number, number, number], rad: number): [number, number, number] {
  if (Math.abs(rad) < 1e-9) return [x, y, z];
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [x * c - y * s, x * s + y * c, z];
}

/** Rotate position by Euler degrees around origin. Order: X, Y, Z. */
export function rotatePositionAroundOrigin(
  pos: [number, number, number],
  [rx, ry, rz]: [number, number, number]
): [number, number, number] {
  let [x, y, z] = pos;
  [x, y, z] = rotateXRad([x, y, z], (rx * Math.PI) / 180);
  [x, y, z] = rotateYRad([x, y, z], (ry * Math.PI) / 180);
  [x, y, z] = rotateZRad([x, y, z], (rz * Math.PI) / 180);
  return [Math.round(x), Math.round(y), Math.round(z)];
}

export function getShapePositionsAt(
  params: Omit<AddShapeParams, 'getVoxel'>
): [number, number, number][] {
  const { position, rotation, shape, size } = params;
  if (shape === 'empty' || size < 1) return [];
  const raw = initShape(size, shape, 0);
  const [px, py, pz] = position;
  const positions: [number, number, number][] = [];
  for (const key of raw.keys()) {
    const [x, y, z] = rotatePositionAroundOrigin(parseCoordKey(key), rotation);
    positions.push([x + px, y + py, z + pz]);
  }
  return positions;
}
