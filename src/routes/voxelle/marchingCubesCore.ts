/**
 * Pure marching-cubes surface extraction for voxel maps.
 * No Three.js usage so it can run in a worker.
 */
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { coordKey, parseCoordKey } from './coordUtils';

type Vec3 = [number, number, number];

export interface MarchingCubesCoreResult {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

const ISO_LEVEL = 0.5;
const EPS = 1e-6;
const EDGE_TABLE = edgeTable as unknown as ArrayLike<number>;
const TRI_TABLE = triTable as unknown as ArrayLike<number>;

const CORNER_OFFSETS: Vec3[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1]
];

const EDGE_CORNERS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7]
];

function idx(x: number, y: number, z: number, nx: number, ny: number): number {
  return (z * ny + y) * nx + x;
}

function sampleField(
  values: Float32Array,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number
): number {
  if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return 0;
  return values[idx(x, y, z, nx, ny)];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Marching cubes over a binary voxel occupancy field.
 * Returns a single vertex-colored mesh under color key 0.
 */
export function computeMarchingCubes(
  voxels: Map<string, number>
): Map<number, MarchingCubesCoreResult> {
  if (voxels.size === 0) return new Map();

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const key of voxels.keys()) {
    const [x, y, z] = parseCoordKey(key);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }

  const nodeMinX = minX - 1;
  const nodeMinY = minY - 1;
  const nodeMinZ = minZ - 1;
  // With symmetric corner sampling (-1..0), we need one extra +axis layer
  // so the final outside->inside transition is still represented.
  const nodeMaxX = maxX + 2;
  const nodeMaxY = maxY + 2;
  const nodeMaxZ = maxZ + 2;

  const nx = nodeMaxX - nodeMinX + 1;
  const ny = nodeMaxY - nodeMinY + 1;
  const nz = nodeMaxZ - nodeMinZ + 1;

  const values = new Float32Array(nx * ny * nz);
  const colR = new Float32Array(nx * ny * nz);
  const colG = new Float32Array(nx * ny * nz);
  const colB = new Float32Array(nx * ny * nz);

  // Field value at each lattice corner = count of occupied voxels touching that corner.
  for (let z = 0; z < nz; z++) {
    const gz = nodeMinZ + z;
    for (let y = 0; y < ny; y++) {
      const gy = nodeMinY + y;
      for (let x = 0; x < nx; x++) {
        const gx = nodeMinX + x;
        const i = idx(x, y, z, nx, ny);

        let count = 0;
        let sr = 0;
        let sg = 0;
        let sb = 0;

        // Sample the 8 voxels that share this lattice corner symmetrically.
        // Using -1..0 avoids directional bias that can drop opposite-side faces.
        for (let dz = -1; dz <= 0; dz++) {
          for (let dy = -1; dy <= 0; dy++) {
            for (let dx = -1; dx <= 0; dx++) {
              const col = voxels.get(coordKey(gx + dx, gy + dy, gz + dz));
              if (col === undefined) continue;
              count++;
              sr += (col >> 16) & 0xff;
              sg += (col >> 8) & 0xff;
              sb += col & 0xff;
            }
          }
        }

        values[i] = count;
        if (count > 0) {
          colR[i] = sr / count / 255;
          colG[i] = sg / count / 255;
          colB[i] = sb / count / 255;
        }
      }
    }
  }

  const gradX = new Float32Array(nx * ny * nz);
  const gradY = new Float32Array(nx * ny * nz);
  const gradZ = new Float32Array(nx * ny * nz);
  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = idx(x, y, z, nx, ny);
        const gx = sampleField(values, x - 1, y, z, nx, ny, nz) - sampleField(values, x + 1, y, z, nx, ny, nz);
        const gy = sampleField(values, x, y - 1, z, nx, ny, nz) - sampleField(values, x, y + 1, z, nx, ny, nz);
        const gz = sampleField(values, x, y, z - 1, nx, ny, nz) - sampleField(values, x, y, z + 1, nx, ny, nz);
        const gl = Math.hypot(gx, gy, gz);
        if (gl > EPS) {
          gradX[i] = gx / gl;
          gradY[i] = gy / gl;
          gradZ[i] = gz / gl;
        }
      }
    }
  }

  const rawPos: number[] = [];
  const rawNorm: number[] = [];
  const rawCol: number[] = [];

  const edgePos = new Float32Array(12 * 3);
  const edgeNorm = new Float32Array(12 * 3);
  const edgeColor = new Float32Array(12 * 3);

  for (let z = 0; z < nz - 1; z++) {
    for (let y = 0; y < ny - 1; y++) {
      for (let x = 0; x < nx - 1; x++) {
        let cubeIndex = 0;
        const cornerValues = new Float32Array(8);
        const cornerX = new Float32Array(8);
        const cornerY = new Float32Array(8);
        const cornerZ = new Float32Array(8);
        const cornerNX = new Float32Array(8);
        const cornerNY = new Float32Array(8);
        const cornerNZ = new Float32Array(8);
        const cornerR = new Float32Array(8);
        const cornerG = new Float32Array(8);
        const cornerB = new Float32Array(8);

        for (let c = 0; c < 8; c++) {
          const [ox, oy, oz] = CORNER_OFFSETS[c];
          const sx = x + ox;
          const sy = y + oy;
          const sz = z + oz;
          const i = idx(sx, sy, sz, nx, ny);
          const v = values[i];
          cornerValues[c] = v;
          if (v < ISO_LEVEL) cubeIndex |= 1 << c;

          cornerX[c] = nodeMinX + sx + 0.5;
          cornerY[c] = nodeMinY + sy + 0.5;
          cornerZ[c] = nodeMinZ + sz + 0.5;
          cornerNX[c] = gradX[i];
          cornerNY[c] = gradY[i];
          cornerNZ[c] = gradZ[i];
          cornerR[c] = colR[i];
          cornerG[c] = colG[i];
          cornerB[c] = colB[i];
        }

        const edgeMask = EDGE_TABLE[cubeIndex];
        if (edgeMask === 0) continue;

        for (let e = 0; e < 12; e++) {
          if ((edgeMask & (1 << e)) === 0) continue;
          const [a, b] = EDGE_CORNERS[e];
          const va = cornerValues[a];
          const vb = cornerValues[b];
          const denom = vb - va;
          const mu = Math.abs(denom) < EPS ? 0.5 : (ISO_LEVEL - va) / denom;
          const t = Math.max(0, Math.min(1, mu));
          const base = e * 3;

          edgePos[base] = lerp(cornerX[a], cornerX[b], t);
          edgePos[base + 1] = lerp(cornerY[a], cornerY[b], t);
          edgePos[base + 2] = lerp(cornerZ[a], cornerZ[b], t);

          const nxL = lerp(cornerNX[a], cornerNX[b], t);
          const nyL = lerp(cornerNY[a], cornerNY[b], t);
          const nzL = lerp(cornerNZ[a], cornerNZ[b], t);
          const nl = Math.hypot(nxL, nyL, nzL);
          if (nl > EPS) {
            edgeNorm[base] = nxL / nl;
            edgeNorm[base + 1] = nyL / nl;
            edgeNorm[base + 2] = nzL / nl;
          } else {
            edgeNorm[base] = 0;
            edgeNorm[base + 1] = 1;
            edgeNorm[base + 2] = 0;
          }

          // Prefer color from the denser endpoint so outside corners do not darken colors.
          const useA = va >= vb;
          edgeColor[base] = useA ? cornerR[a] : cornerR[b];
          edgeColor[base + 1] = useA ? cornerG[a] : cornerG[b];
          edgeColor[base + 2] = useA ? cornerB[a] : cornerB[b];
        }

        const triOffset = cubeIndex * 16;
        for (let t = 0; TRI_TABLE[triOffset + t] !== -1; t += 3) {
          const e0 = TRI_TABLE[triOffset + t];
          const e1 = TRI_TABLE[triOffset + t + 1];
          const e2 = TRI_TABLE[triOffset + t + 2];
          const b0 = e0 * 3;
          const b1 = e1 * 3;
          const b2 = e2 * 3;

          rawPos.push(
            edgePos[b0], edgePos[b0 + 1], edgePos[b0 + 2],
            edgePos[b1], edgePos[b1 + 1], edgePos[b1 + 2],
            edgePos[b2], edgePos[b2 + 1], edgePos[b2 + 2]
          );

          rawNorm.push(
            edgeNorm[b0], edgeNorm[b0 + 1], edgeNorm[b0 + 2],
            edgeNorm[b1], edgeNorm[b1 + 1], edgeNorm[b1 + 2],
            edgeNorm[b2], edgeNorm[b2 + 1], edgeNorm[b2 + 2]
          );

          rawCol.push(
            edgeColor[b0], edgeColor[b0 + 1], edgeColor[b0 + 2],
            edgeColor[b1], edgeColor[b1 + 1], edgeColor[b1 + 2],
            edgeColor[b2], edgeColor[b2 + 1], edgeColor[b2 + 2]
          );
        }
      }
    }
  }

  if (rawPos.length === 0) return new Map();

  const outPos: number[] = [];
  const outNormX: number[] = [];
  const outNormY: number[] = [];
  const outNormZ: number[] = [];
  const outColR: number[] = [];
  const outColG: number[] = [];
  const outColB: number[] = [];
  const outCounts: number[] = [];
  const indices: number[] = [];
  const vertexMap = new Map<string, number>();

  for (let i = 0; i < rawPos.length; i += 3) {
    const x = rawPos[i];
    const y = rawPos[i + 1];
    const z = rawPos[i + 2];
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    let vi = vertexMap.get(key);
    if (vi === undefined) {
      vi = outPos.length / 3;
      vertexMap.set(key, vi);
      outPos.push(x, y, z);
      outNormX.push(0);
      outNormY.push(0);
      outNormZ.push(0);
      outColR.push(0);
      outColG.push(0);
      outColB.push(0);
      outCounts.push(0);
    }

    outNormX[vi] += rawNorm[i];
    outNormY[vi] += rawNorm[i + 1];
    outNormZ[vi] += rawNorm[i + 2];
    outColR[vi] += rawCol[i];
    outColG[vi] += rawCol[i + 1];
    outColB[vi] += rawCol[i + 2];
    outCounts[vi] += 1;
    indices.push(vi);
  }

  const outNormals = new Float32Array(outPos.length);
  const outColors = new Float32Array(outPos.length);
  for (let i = 0; i < outPos.length / 3; i++) {
    const nxv = outNormX[i];
    const nyv = outNormY[i];
    const nzv = outNormZ[i];
    const nl = Math.hypot(nxv, nyv, nzv);
    if (nl > EPS) {
      outNormals[i * 3] = nxv / nl;
      outNormals[i * 3 + 1] = nyv / nl;
      outNormals[i * 3 + 2] = nzv / nl;
    } else {
      outNormals[i * 3] = 0;
      outNormals[i * 3 + 1] = 1;
      outNormals[i * 3 + 2] = 0;
    }

    const c = Math.max(1, outCounts[i]);
    outColors[i * 3] = Math.max(0, Math.min(1, outColR[i] / c));
    outColors[i * 3 + 1] = Math.max(0, Math.min(1, outColG[i] / c));
    outColors[i * 3 + 2] = Math.max(0, Math.min(1, outColB[i] / c));
  }

  const result = new Map<number, MarchingCubesCoreResult>();
  result.set(0, {
    positions: new Float32Array(outPos),
    normals: outNormals,
    colors: outColors,
    indices: new Uint32Array(indices)
  });
  return result;
}
