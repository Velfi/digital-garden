import { coordKey, parseCoordKey } from '../coordUtils';

export type GridSize = number;
export type StartShape = 'cube' | 'orb' | 'cylinder' | 'hollowCube' | 'plane' | 'empty';

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
): Map<string, number> {
  const map = new Map<string, number>();
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
        }
        if (include) map.set(coordKey(x, y, z), color);
      }
    }
  }
  return map;
}

export function initFilledCube(size: GridSize, color: number = DEFAULT_COLOR): Map<string, number> {
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

export type AddShapeParams = {
  position: [number, number, number];
  rotation: [number, number, number];
  shape: StartShape;
  size: number;
  color: number;
};

/** Rotate position by quarter-turns (0–3) around origin. Order: X, Y, Z. */
export function rotatePositionAroundOrigin(
  pos: [number, number, number],
  [rx, ry, rz]: [number, number, number]
): [number, number, number] {
  let [x, y, z] = pos;
  [x, y, z] = rotateX([x, y, z], rx);
  [x, y, z] = rotateY([x, y, z], ry);
  [x, y, z] = rotateZ([x, y, z], rz);
  return [x, y, z];
}

export function getShapePositionsAt(
  params: Omit<AddShapeParams, 'color'>
): [number, number, number][] {
  const { position, rotation, shape, size } = params;
  if (shape === 'empty' || size < 1) return [];
  const raw = initShape(size, shape, 0);
  const [px, py, pz] = position;
  const [rx, ry, rz] = rotation;
  const positions: [number, number, number][] = [];
  for (const key of raw.keys()) {
    let [x, y, z] = parseCoordKey(key);
    [x, y, z] = rotateX([x, y, z], rx);
    [x, y, z] = rotateY([x, y, z], ry);
    [x, y, z] = rotateZ([x, y, z], rz);
    positions.push([x + px, y + py, z + pz]);
  }
  return positions;
}
