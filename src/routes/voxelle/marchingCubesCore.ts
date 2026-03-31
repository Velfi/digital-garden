/**
 * Pure marching-cubes surface extraction for voxel maps.
 * No Three.js usage so it can run in a worker.
 */
import { edgeTable, triTable } from 'three/addons/objects/MarchingCubes.js';
import { coordKey, parseCoordKey } from './coordUtils';
import type { Voxel } from './voxelMaterial';
import { voxelBucketKey } from './voxelMaterial';
import { computeTransmissionBound, isTransmissiveMaterial } from './transmissionPolicy';

type Vec3 = [number, number, number];

export interface MarchingCubesCoreResult {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  slabThickness: Float32Array;
  indices: Uint32Array;
}

/** Shared with dual contouring and marching cubes (corner-count field, iso 0.5). */
export const VOXEL_ISO_LEVEL = 0.5;
const ISO_LEVEL = VOXEL_ISO_LEVEL;
export const VOXEL_MARCHING_EPS = 1e-6;
const EPS = VOXEL_MARCHING_EPS;
const EDGE_TABLE = edgeTable as unknown as ArrayLike<number>;
const TRI_TABLE = triTable as unknown as ArrayLike<number>;

export const MARCHING_CORNER_OFFSETS: Vec3[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1]
];

export const MARCHING_EDGE_CORNERS: [number, number][] = [
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

export function marchingLatticeIndex(x: number, y: number, z: number, nx: number, ny: number): number {
  return (z * ny + y) * nx + x;
}

export function sampleMarchingField(
  values: Float32Array,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number
): number {
  if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return 0;
  return values[marchingLatticeIndex(x, y, z, nx, ny)];
}

export interface MarchingLatticeField {
  nodeMinX: number;
  nodeMinY: number;
  nodeMinZ: number;
  nx: number;
  ny: number;
  nz: number;
  values: Float32Array;
  gradX: Float32Array;
  gradY: Float32Array;
  gradZ: Float32Array;
  colR: Float32Array;
  colG: Float32Array;
  colB: Float32Array;
  bucketMaterial: Voxel['material'];
  bucketColor: number;
}

/**
 * Corner-count scalar field and gradients for meshing.
 *
 * @param colorVoxels Voxels used for bucket material metadata and preferred vertex coloring (per-bucket pass).
 * @param occupancyVoxels If set, lattice bounds and `values[]` corner counts use this full map so the
 *   implicit surface matches **all** solid voxels. Vertex colors still prefer `colorVoxels` at each corner;
 *   if the bucket contributes nothing at a corner but another voxel does, RGB falls back to the occupancy
 *   average (avoids gaps between color buckets in dual contouring). When omitted, behaves like a single
 *   source (marching cubes per bucket).
 */
export function buildMarchingLatticeField(
  colorVoxels: Map<string, Voxel>,
  occupancyVoxels?: Map<string, Voxel>
): MarchingLatticeField | null {
  const occ = occupancyVoxels ?? colorVoxels;
  if (occ.size === 0) return null;
  if (colorVoxels.size === 0) return null;
  const firstVoxel = colorVoxels.values().next().value as Voxel;
  const bucketMaterial = firstVoxel.material;
  const bucketColor = firstVoxel.color & 0xffffff;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const key of occ.keys()) {
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

  for (let z = 0; z < nz; z++) {
    const gz = nodeMinZ + z;
    for (let y = 0; y < ny; y++) {
      const gy = nodeMinY + y;
      for (let x = 0; x < nx; x++) {
        const gx = nodeMinX + x;
        const i = marchingLatticeIndex(x, y, z, nx, ny);

        let countOcc = 0;
        let srOcc = 0;
        let sgOcc = 0;
        let sbOcc = 0;
        let countB = 0;
        let srB = 0;
        let sgB = 0;
        let sbB = 0;

        for (let dz = -1; dz <= 0; dz++) {
          for (let dy = -1; dy <= 0; dy++) {
            for (let dx = -1; dx <= 0; dx++) {
              const k = coordKey(gx + dx, gy + dy, gz + dz);
              const vo = occ.get(k);
              if (vo !== undefined) {
                countOcc++;
                const rgb = vo.color;
                srOcc += (rgb >> 16) & 0xff;
                sgOcc += (rgb >> 8) & 0xff;
                sbOcc += rgb & 0xff;
              }
              const vb = colorVoxels.get(k);
              if (vb !== undefined) {
                countB++;
                const rgb = vb.color;
                srB += (rgb >> 16) & 0xff;
                sgB += (rgb >> 8) & 0xff;
                sbB += rgb & 0xff;
              }
            }
          }
        }

        values[i] = countOcc;
        if (countB > 0) {
          colR[i] = srB / countB / 255;
          colG[i] = sgB / countB / 255;
          colB[i] = sbB / countB / 255;
        } else if (countOcc > 0) {
          colR[i] = srOcc / countOcc / 255;
          colG[i] = sgOcc / countOcc / 255;
          colB[i] = sbOcc / countOcc / 255;
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
        const i = marchingLatticeIndex(x, y, z, nx, ny);
        const gx =
          sampleMarchingField(values, x - 1, y, z, nx, ny, nz) -
          sampleMarchingField(values, x + 1, y, z, nx, ny, nz);
        const gy =
          sampleMarchingField(values, x, y - 1, z, nx, ny, nz) -
          sampleMarchingField(values, x, y + 1, z, nx, ny, nz);
        const gz =
          sampleMarchingField(values, x, y, z - 1, nx, ny, nz) -
          sampleMarchingField(values, x, y, z + 1, nx, ny, nz);
        const gl = Math.hypot(gx, gy, gz);
        if (gl > EPS) {
          gradX[i] = gx / gl;
          gradY[i] = gy / gl;
          gradZ[i] = gz / gl;
        }
      }
    }
  }

  return {
    nodeMinX,
    nodeMinY,
    nodeMinZ,
    nx,
    ny,
    nz,
    values,
    gradX,
    gradY,
    gradZ,
    colR,
    colG,
    colB,
    bucketMaterial,
    bucketColor
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function computeMarchingCubesBucket(
  voxels: Map<string, Voxel>,
  allVoxels: Map<string, Voxel>
): MarchingCubesCoreResult | null {
  const field = buildMarchingLatticeField(voxels, allVoxels);
  if (!field) return null;
  const {
    nodeMinX,
    nodeMinY,
    nodeMinZ,
    nx,
    ny,
    nz,
    values,
    gradX,
    gradY,
    gradZ,
    colR,
    colG,
    colB,
    bucketMaterial,
    bucketColor
  } = field;

  const rawPos: number[] = [];
  const rawNorm: number[] = [];
  const rawCol: number[] = [];
  const rawSlab: number[] = [];

  const edgePos = new Float32Array(12 * 3);
  const edgeNorm = new Float32Array(12 * 3);
  const edgeColor = new Float32Array(12 * 3);
  const edgeSlab = new Float32Array(12);

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
          const [ox, oy, oz] = MARCHING_CORNER_OFFSETS[c];
          const sx = x + ox;
          const sy = y + oy;
          const sz = z + oz;
          const i = marchingLatticeIndex(sx, sy, sz, nx, ny);
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
          const [a, b] = MARCHING_EDGE_CORNERS[e];
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

          const useA = va >= vb;
          edgeColor[base] = useA ? cornerR[a] : cornerR[b];
          edgeColor[base + 1] = useA ? cornerG[a] : cornerG[b];
          edgeColor[base + 2] = useA ? cornerB[a] : cornerB[b];
          edgeSlab[e] = Math.max(1, lerp(va, vb, t));
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
            edgePos[b0],
            edgePos[b0 + 1],
            edgePos[b0 + 2],
            edgePos[b1],
            edgePos[b1 + 1],
            edgePos[b1 + 2],
            edgePos[b2],
            edgePos[b2 + 1],
            edgePos[b2 + 2]
          );

          rawNorm.push(
            edgeNorm[b0],
            edgeNorm[b0 + 1],
            edgeNorm[b0 + 2],
            edgeNorm[b1],
            edgeNorm[b1 + 1],
            edgeNorm[b1 + 2],
            edgeNorm[b2],
            edgeNorm[b2 + 1],
            edgeNorm[b2 + 2]
          );

          rawCol.push(
            edgeColor[b0],
            edgeColor[b0 + 1],
            edgeColor[b0 + 2],
            edgeColor[b1],
            edgeColor[b1 + 1],
            edgeColor[b1 + 2],
            edgeColor[b2],
            edgeColor[b2 + 1],
            edgeColor[b2 + 2]
          );
          rawSlab.push(edgeSlab[e0], edgeSlab[e1], edgeSlab[e2]);
        }
      }
    }
  }

  if (rawPos.length === 0) return null;

  const outPos: number[] = [];
  const outNormX: number[] = [];
  const outNormY: number[] = [];
  const outNormZ: number[] = [];
  const outColR: number[] = [];
  const outColG: number[] = [];
  const outColB: number[] = [];
  const outSlab: number[] = [];
  const outCounts: number[] = [];
  const indices: number[] = [];
  const vertexMap = new Map<string, number>();

  for (let i = 0; i < rawPos.length; i += 3) {
    const px = rawPos[i];
    const py = rawPos[i + 1];
    const pz = rawPos[i + 2];
    const key = `${px.toFixed(6)},${py.toFixed(6)},${pz.toFixed(6)}`;
    let vi = vertexMap.get(key);
    if (vi === undefined) {
      vi = outPos.length / 3;
      vertexMap.set(key, vi);
      outPos.push(px, py, pz);
      outNormX.push(0);
      outNormY.push(0);
      outNormZ.push(0);
      outColR.push(0);
      outColG.push(0);
      outColB.push(0);
      outSlab.push(0);
      outCounts.push(0);
    }

    outNormX[vi] += rawNorm[i];
    outNormY[vi] += rawNorm[i + 1];
    outNormZ[vi] += rawNorm[i + 2];
    outColR[vi] += rawCol[i];
    outColG[vi] += rawCol[i + 1];
    outColB[vi] += rawCol[i + 2];
    outSlab[vi] += rawSlab[i / 3] ?? 1;
    outCounts[vi] += 1;
    indices.push(vi);
  }

  const outNormals = new Float32Array(outPos.length);
  const outColors = new Float32Array(outPos.length);
  const outSlabThickness = new Float32Array(outPos.length / 3);
  const transmissive = isTransmissiveMaterial(bucketMaterial);
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
    const rr = Math.max(0, Math.min(1, outColR[i] / c));
    const gg = Math.max(0, Math.min(1, outColG[i] / c));
    const bb = Math.max(0, Math.min(1, outColB[i] / c));
    const slabDepth = Math.max(1, outSlab[i] / c);
    const transmissionMul = transmissive
      ? computeTransmissionBound(bucketColor, bucketMaterial, slabDepth)
      : 1;
    outColors[i * 3] = rr * transmissionMul;
    outColors[i * 3 + 1] = gg * transmissionMul;
    outColors[i * 3 + 2] = bb * transmissionMul;
    outSlabThickness[i] = slabDepth;
  }

  return {
    positions: new Float32Array(outPos),
    normals: outNormals,
    colors: outColors,
    slabThickness: outSlabThickness,
    indices: new Uint32Array(indices)
  };
}

/**
 * Marching cubes per (color, material) bucket.
 * Returns one vertex-colored mesh per bucket key: `${color}|${material}`.
 */
export function computeMarchingCubes(
  voxels: Map<string, Voxel>
): Map<string, MarchingCubesCoreResult> {
  if (voxels.size === 0) return new Map();
  const grouped = new Map<string, Map<string, Voxel>>();
  for (const [key, voxel] of voxels) {
    const bucket = voxelBucketKey(voxel);
    let bucketMap = grouped.get(bucket);
    if (!bucketMap) {
      bucketMap = new Map();
      grouped.set(bucket, bucketMap);
    }
    bucketMap.set(key, voxel);
  }

  const result = new Map<string, MarchingCubesCoreResult>();
  for (const [bucketKey, bucketVoxels] of grouped) {
    const mesh = computeMarchingCubesBucket(bucketVoxels, voxels);
    if (mesh) result.set(bucketKey, mesh);
  }
  return result;
}
