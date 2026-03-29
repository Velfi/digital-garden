/**
 * Dual contouring on the same implicit field as marching cubes (worker-safe).
 *
 * Topology follows standard DC (Nielsen; see e.g. Boris the Brave dual contouring tutorial):
 * one minimizing vertex per active cell, then for each lattice edge where the field crosses the
 * iso level, a quad connecting the four cells that share that edge.
 *
 * Cells use min-corner indices; we iterate cx ∈ [-1, nx-1] (and same for y,z) so both negative
 * and positive ghost cells exist — required so boundary lattice edges still have four cell verts.
 *
 * Edge loops must cover *all* axis-aligned lattice edges: (nx−1)·ny·nz X-edges, nx·(ny−1)·nz
 * Y-edges, nx·ny·(nz−1) Z-edges — not (nx−1)(ny−1)(nz−1) per axis, or entire boundary layers of
 * quads are skipped.
 *
 * **Occupancy:** The scalar field must use every voxel in the scene for corner counts (`buildMarchingLatticeField`
 * `occupancyVoxels`). Per-bucket-only fields treat adjacent voxels of other colors as empty, which misplaces
 * the iso-surface and produces large gaps even when “material” is uniform but paint hexes differ.
 */
import type { MarchingCubesCoreResult } from './marchingCubesCore';
import {
  buildMarchingLatticeField,
  marchingLatticeIndex,
  MARCHING_CORNER_OFFSETS,
  MARCHING_EDGE_CORNERS,
  sampleMarchingField,
  VOXEL_ISO_LEVEL,
  VOXEL_MARCHING_EPS
} from './marchingCubesCore';
import type { Voxel } from './voxelMaterial';
import { voxelBucketKey } from './voxelMaterial';
import { computeTransmissionBound, isTransmissiveMaterial } from './transmissionPolicy';

const ISO = VOXEL_ISO_LEVEL;
const EPS = VOXEL_MARCHING_EPS;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Solve A x = b for 3x3 symmetric A; returns null if singular. */
function solve3x3(
  a00: number,
  a01: number,
  a02: number,
  a11: number,
  a12: number,
  a22: number,
  b0: number,
  b1: number,
  b2: number
): [number, number, number] | null {
  const m: number[][] = [
    [a00, a01, a02, b0],
    [a01, a11, a12, b1],
    [a02, a12, a22, b2]
  ];
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    let maxAbs = Math.abs(m[col]![col]!);
    for (let r = col + 1; r < 3; r++) {
      const v = Math.abs(m[r]![col]!);
      if (v > maxAbs) {
        maxAbs = v;
        pivot = r;
      }
    }
    if (maxAbs < 1e-12) return null;
    if (pivot !== col) {
      const tmp = m[pivot]!;
      m[pivot] = m[col]!;
      m[col] = tmp;
    }
    const div = m[col]![col]!;
    for (let c = col; c < 4; c++) m[col]![c]! /= div;
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = m[r]![col]!;
      if (Math.abs(f) < 1e-15) continue;
      for (let c = col; c < 4; c++) m[r]![c]! -= f * m[col]![c]!;
    }
  }
  return [m[0]![3]!, m[1]![3]!, m[2]![3]!];
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function cellKey(cx: number, cy: number, cz: number): string {
  return `${cx},${cy},${cz}`;
}

/** Central-difference gradient from scalar field; OOB samples are 0 (matches marching lattice). */
function sampleMarchingGrad(
  values: Float32Array,
  nx: number,
  ny: number,
  nz: number,
  x: number,
  y: number,
  z: number,
  out: { x: number; y: number; z: number }
): void {
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
    out.x = gx / gl;
    out.y = gy / gl;
    out.z = gz / gl;
  } else {
    out.x = 0;
    out.y = 1;
    out.z = 0;
  }
}

function sampleMarchingColor(
  colR: Float32Array,
  colG: Float32Array,
  colB: Float32Array,
  x: number,
  y: number,
  z: number,
  nx: number,
  ny: number,
  nz: number,
  out: { r: number; g: number; b: number }
): void {
  if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) {
    out.r = 0;
    out.g = 0;
    out.b = 0;
    return;
  }
  const i = marchingLatticeIndex(x, y, z, nx, ny);
  out.r = colR[i]!;
  out.g = colG[i]!;
  out.b = colB[i]!;
}

const _gradTmp = { x: 0, y: 0, z: 0 };
const _colTmp = { r: 0, g: 0, b: 0 };

function computeDualContourBucket(
  bucketVoxels: Map<string, Voxel>,
  allVoxels: Map<string, Voxel>
): MarchingCubesCoreResult | null {
  /** Geometry + iso-surface from full scene; colors prefer this bucket, else occupancy RGB. */
  const field = buildMarchingLatticeField(bucketVoxels, allVoxels);
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

  const cellVertexIndex = new Map<string, number>();
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const slabs: number[] = [];

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

  /**
   * Ghost cells on all six sides: cx ∈ [-1, nx-1] (and y,z) so cells like (ix, ny-1, iz) exist for
   * top lattice edges; corners sample OOB as 0 (same as marching lattice).
   */
  for (let cz = -1; cz < nz; cz++) {
    for (let cy = -1; cy < ny; cy++) {
      for (let cx = -1; cx < nx; cx++) {
        let cubeIndex = 0;
        for (let c = 0; c < 8; c++) {
          const [ox, oy, oz] = MARCHING_CORNER_OFFSETS[c];
          const sx = cx + ox;
          const sy = cy + oy;
          const sz = cz + oz;
          const v = sampleMarchingField(values, sx, sy, sz, nx, ny, nz);
          cornerValues[c] = v;
          if (v < ISO) cubeIndex |= 1 << c;

          cornerX[c] = nodeMinX + sx + 0.5;
          cornerY[c] = nodeMinY + sy + 0.5;
          cornerZ[c] = nodeMinZ + sz + 0.5;
          sampleMarchingGrad(values, nx, ny, nz, sx, sy, sz, _gradTmp);
          cornerNX[c] = _gradTmp.x;
          cornerNY[c] = _gradTmp.y;
          cornerNZ[c] = _gradTmp.z;
          sampleMarchingColor(colR, colG, colB, sx, sy, sz, nx, ny, nz, _colTmp);
          cornerR[c] = _colTmp.r;
          cornerG[c] = _colTmp.g;
          cornerB[c] = _colTmp.b;
        }

        if (cubeIndex === 0 || cubeIndex === 255) continue;

        let a00 = 0;
        let a01 = 0;
        let a02 = 0;
        let a11 = 0;
        let a12 = 0;
        let a22 = 0;
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        let cxSum = 0;
        let cySum = 0;
        let czSum = 0;
        let nHerm = 0;
        let colSr = 0;
        let colSg = 0;
        let colSb = 0;
        let slabSum = 0;

        for (let e = 0; e < 12; e++) {
          const [a, b] = MARCHING_EDGE_CORNERS[e];
          const va = cornerValues[a];
          const vb = cornerValues[b];
          const insideA = va >= ISO;
          const insideB = vb >= ISO;
          if (insideA === insideB) continue;

          const denom = vb - va;
          const mu = Math.abs(denom) < EPS ? 0.5 : (ISO - va) / denom;
          const t = clamp(mu, 0, 1);

          const px = lerp(cornerX[a], cornerX[b], t);
          const py = lerp(cornerY[a], cornerY[b], t);
          const pz = lerp(cornerZ[a], cornerZ[b], t);

          let nxL = lerp(cornerNX[a], cornerNX[b], t);
          let nyL = lerp(cornerNY[a], cornerNY[b], t);
          let nzL = lerp(cornerNZ[a], cornerNZ[b], t);
          const nl = Math.hypot(nxL, nyL, nzL);
          if (nl > EPS) {
            nxL /= nl;
            nyL /= nl;
            nzL /= nl;
          } else {
            nxL = 0;
            nyL = 1;
            nzL = 0;
          }

          const d = nxL * px + nyL * py + nzL * pz;
          a00 += nxL * nxL;
          a01 += nxL * nyL;
          a02 += nxL * nzL;
          a11 += nyL * nyL;
          a12 += nyL * nzL;
          a22 += nzL * nzL;
          b0 += nxL * d;
          b1 += nyL * d;
          b2 += nzL * d;

          cxSum += px;
          cySum += py;
          czSum += pz;
          nHerm++;

          const useA = va >= vb;
          colSr += useA ? cornerR[a] : cornerR[b];
          colSg += useA ? cornerG[a] : cornerG[b];
          colSb += useA ? cornerB[a] : cornerB[b];
          slabSum += Math.max(1, lerp(va, vb, t));
        }

        if (nHerm === 0) continue;

        const minWx = nodeMinX + cx + 0.5;
        const maxWx = nodeMinX + cx + 1.5;
        const minWy = nodeMinY + cy + 0.5;
        const maxWy = nodeMinY + cy + 1.5;
        const minWz = nodeMinZ + cz + 0.5;
        const maxWz = nodeMinZ + cz + 1.5;

        let px: number;
        let py: number;
        let pz: number;
        const solved = solve3x3(a00, a01, a02, a11, a12, a22, b0, b1, b2);
        if (solved) {
          px = clamp(solved[0], minWx, maxWx);
          py = clamp(solved[1], minWy, maxWy);
          pz = clamp(solved[2], minWz, maxWz);
        } else {
          px = clamp(cxSum / nHerm, minWx, maxWx);
          py = clamp(cySum / nHerm, minWy, maxWy);
          pz = clamp(czSum / nHerm, minWz, maxWz);
        }

        const vi = positions.length / 3;
        cellVertexIndex.set(cellKey(cx, cy, cz), vi);
        positions.push(px, py, pz);

        const gix = clamp(Math.round(px - nodeMinX - 0.5), 0, nx - 1);
        const giy = clamp(Math.round(py - nodeMinY - 0.5), 0, ny - 1);
        const giz = clamp(Math.round(pz - nodeMinZ - 0.5), 0, nz - 1);
        const gi = marchingLatticeIndex(gix, giy, giz, nx, ny);
        let nnx = gradX[gi];
        let nny = gradY[gi];
        let nnz = gradZ[gi];
        const gn = Math.hypot(nnx, nny, nnz);
        if (gn > EPS) {
          nnx /= gn;
          nny /= gn;
          nnz /= gn;
        } else {
          nnx = 0;
          nny = 1;
          nnz = 0;
        }
        normals.push(nnx, nny, nnz);

        const nh = Math.max(1, nHerm);
        colors.push(colSr / nh, colSg / nh, colSb / nh);
        slabs.push(Math.max(1, slabSum / nh));
      }
    }
  }

  if (positions.length === 0) return null;

  const indices: number[] = [];

  /**
   * Standard DC quad emission with deterministic winding.
   *
   * The four cells around each lattice edge are in a known cyclic order (derived from the
   * right-hand rule). We pass them in that CCW order (as seen from the + axis direction) and
   * flip based on the sign change: if va >= ISO the surface normal points in the + axis direction
   * (inside→outside), so we keep CCW. Otherwise we reverse for -axis normal.
   *
   * This replaces the atan2 polar-sort approach which was numerically fragile and produced
   * bow-tie / flipped quads.
   */
  function emitQuad(
    c0: number,
    c1: number,
    c2: number,
    c3: number,
    flipWinding: boolean
  ): void {
    if (flipWinding) {
      indices.push(c0, c3, c2, c0, c2, c1);
    } else {
      indices.push(c0, c1, c2, c0, c2, c3);
    }
  }

  /*
   * For each axis-aligned lattice edge with a sign change, emit a quad joining the 4 cells
   * that share that edge. Cell order is CCW when viewed from the positive axis direction.
   *
   * X-edge (ix,iy,iz)→(ix+1,iy,iz): cells in CCW from +X:
   *   (ix, iy-1, iz-1), (ix, iy, iz-1), (ix, iy, iz), (ix, iy-1, iz)
   *
   * Y-edge (ix,iy,iz)→(ix,iy+1,iz): cells in CCW from +Y:
   *   (ix-1, iy, iz-1), (ix-1, iy, iz), (ix, iy, iz), (ix, iy, iz-1)
   *
   * Z-edge (ix,iy,iz)→(ix,iy,iz+1): cells in CCW from +Z:
   *   (ix-1, iy-1, iz), (ix, iy-1, iz), (ix, iy, iz), (ix-1, iy, iz)
   */

  for (let ix = 0; ix < nx - 1; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let iz = 0; iz < nz; iz++) {
        const va = sampleMarchingField(values, ix, iy, iz, nx, ny, nz);
        const vb = sampleMarchingField(values, ix + 1, iy, iz, nx, ny, nz);
        if ((va >= ISO) === (vb >= ISO)) continue;

        const c0 = cellVertexIndex.get(cellKey(ix, iy - 1, iz - 1));
        const c1 = cellVertexIndex.get(cellKey(ix, iy, iz - 1));
        const c2 = cellVertexIndex.get(cellKey(ix, iy, iz));
        const c3 = cellVertexIndex.get(cellKey(ix, iy - 1, iz));
        if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) continue;

        emitQuad(c0, c1, c2, c3, va < ISO);
      }
    }
  }

  for (let iy = 0; iy < ny - 1; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const va = sampleMarchingField(values, ix, iy, iz, nx, ny, nz);
        const vb = sampleMarchingField(values, ix, iy + 1, iz, nx, ny, nz);
        if ((va >= ISO) === (vb >= ISO)) continue;

        const c0 = cellVertexIndex.get(cellKey(ix - 1, iy, iz - 1));
        const c1 = cellVertexIndex.get(cellKey(ix - 1, iy, iz));
        const c2 = cellVertexIndex.get(cellKey(ix, iy, iz));
        const c3 = cellVertexIndex.get(cellKey(ix, iy, iz - 1));
        if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) continue;

        emitQuad(c0, c1, c2, c3, va < ISO);
      }
    }
  }

  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        const va = sampleMarchingField(values, ix, iy, iz, nx, ny, nz);
        const vb = sampleMarchingField(values, ix, iy, iz + 1, nx, ny, nz);
        if ((va >= ISO) === (vb >= ISO)) continue;

        const c0 = cellVertexIndex.get(cellKey(ix - 1, iy - 1, iz));
        const c1 = cellVertexIndex.get(cellKey(ix, iy - 1, iz));
        const c2 = cellVertexIndex.get(cellKey(ix, iy, iz));
        const c3 = cellVertexIndex.get(cellKey(ix - 1, iy, iz));
        if (c0 === undefined || c1 === undefined || c2 === undefined || c3 === undefined) continue;

        emitQuad(c0, c1, c2, c3, va < ISO);
      }
    }
  }

  if (indices.length === 0) return null;

  const outNormals = new Float32Array(normals.length);
  const outColors = new Float32Array(colors.length);
  const outSlabThickness = new Float32Array(slabs.length);
  const transmissive = isTransmissiveMaterial(bucketMaterial);
  const nv = positions.length / 3;
  for (let i = 0; i < nv; i++) {
    const nxv = normals[i * 3];
    const nyv = normals[i * 3 + 1];
    const nzv = normals[i * 3 + 2];
    outNormals[i * 3] = nxv;
    outNormals[i * 3 + 1] = nyv;
    outNormals[i * 3 + 2] = nzv;

    const rr = colors[i * 3];
    const gg = colors[i * 3 + 1];
    const bb = colors[i * 3 + 2];
    const slabDepth = slabs[i]!;
    const transmissionMul = transmissive
      ? computeTransmissionBound(bucketColor, bucketMaterial, slabDepth)
      : 1;
    outColors[i * 3] = rr * transmissionMul;
    outColors[i * 3 + 1] = gg * transmissionMul;
    outColors[i * 3 + 2] = bb * transmissionMul;
    outSlabThickness[i] = slabDepth;
  }

  return {
    positions: new Float32Array(positions),
    normals: outNormals,
    colors: outColors,
    slabThickness: outSlabThickness,
    indices: new Uint32Array(indices)
  };
}

export function computeDualContour(voxels: Map<string, Voxel>): Map<string, MarchingCubesCoreResult> {
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
    const mesh = computeDualContourBucket(bucketVoxels, voxels);
    if (mesh) result.set(bucketKey, mesh);
  }
  return result;
}
