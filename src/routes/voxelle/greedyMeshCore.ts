/**
 * Pure computation for greedy meshing. No Three.js or DOM.
 * Used by greedyMesh.ts (sync) and greedyMeshWorker.ts (async).
 */
import { coordKey, parseCoordKey } from './coordUtils';

type Vec3 = [number, number, number];

/** AO multiplier presets for states 0–3: 0=full occlusion, 3=no occlusion. */
const AO_PRESETS: Record<1 | 2, number[]> = {
  1: [0.85, 0.92, 0.96, 1.0], // Subtle
  2: [0.55, 0.72, 0.88, 1.0] // Strong
};

/** For each of 4 quad corners (u,v), (u+w,v), (u+w,v+h), (u,v+h): [du1,dv1, du2,dv2, du3,dv3] for the 3 neighbor (u,v) deltas in the slice; depth delta is +1 for +axis, -1 for -axis. */
const AO_NEIGHBORS: [number, number][][] = [
  [
    [-1, 0],
    [0, -1],
    [-1, -1]
  ],
  [
    [1, 0],
    [0, -1],
    [1, -1]
  ],
  [
    [1, 0],
    [0, 1],
    [1, 1]
  ],
  [
    [-1, 0],
    [0, 1],
    [-1, 1]
  ]
];

const FACE_OFFSETS: { n: Vec3; u: Vec3; v: Vec3 }[] = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] }
];

function quadPositionFromSlice(
  axis: number,
  sign: number,
  depth: number,
  u: number,
  v: number,
  w: number,
  h: number
): Vec3 {
  const faceOffset = 0.5 * sign;
  if (axis === 0) return [depth + faceOffset, u - 0.5, v - 0.5];
  if (axis === 1) return [u - 0.5, depth + faceOffset, v - 0.5];
  return [u - 0.5, v - 0.5, depth + faceOffset];
}

function hasNeighbor(pos: Vec3, axis: number, sign: number, voxelSet: Set<string>): boolean {
  const [x, y, z] = pos;
  let nx = x,
    ny = y,
    nz = z;
  if (axis === 0) nx += sign;
  else if (axis === 1) ny += sign;
  else nz += sign;
  return voxelSet.has(coordKey(nx, ny, nz));
}

function getAOState(side1: number, side2: number, corner: number): number {
  if (side1 && side2) return 0;
  return 3 - (side1 + side2 + corner);
}

function getAONeighborCoords(
  axis: number,
  sign: number,
  depth: number,
  cu: number,
  cv: number,
  cornerIndex: number
): [Vec3, Vec3, Vec3] {
  const [[du1, dv1], [du2, dv2], [du3, dv3]] = AO_NEIGHBORS[cornerIndex];
  const dIdx = axis;
  const uIdx = axis === 0 ? 1 : 0;
  const vIdx = axis === 2 ? 1 : 2;
  const toWorld = (du: number, dv: number): Vec3 => {
    const out: Vec3 = [0, 0, 0];
    out[dIdx] = depth + sign;
    out[uIdx] = cu + du;
    out[vIdx] = cv + dv;
    return out;
  };
  return [toWorld(du1, dv1), toWorld(du2, dv2), toWorld(du3, dv3)];
}

function getCornerAO(
  axis: number,
  sign: number,
  depth: number,
  cu: number,
  cv: number,
  cornerIndex: number,
  voxelSet: Set<string>
): number {
  const [n1, n2, n3] = getAONeighborCoords(axis, sign, depth, cu, cv, cornerIndex);
  const s1 = voxelSet.has(coordKey(n1[0], n1[1], n1[2])) ? 1 : 0;
  const s2 = voxelSet.has(coordKey(n2[0], n2[1], n2[2])) ? 1 : 0;
  const c = voxelSet.has(coordKey(n3[0], n3[1], n3[2])) ? 1 : 0;
  return getAOState(s1, s2, c);
}

function aoStateToMultiplier(state: number, values: number[]): number {
  return values[state];
}

const WELD_EPS = 1e-6;

function vertexKey(x: number, y: number, z: number, nx: number, ny: number, nz: number): string {
  const q = (v: number) => Math.round(v / WELD_EPS) * WELD_EPS;
  return `${q(x)},${q(y)},${q(z)},${nx},${ny},${nz}`;
}

function precomputeVertexAO(
  faces: { pos: Vec3; axis: number; sign: number }[],
  voxelSet: Set<string>
): Map<string, number> {
  const aoMap = new Map<string, number>();
  for (const f of faces) {
    const [x, y, z] = f.pos;
    const { axis, sign } = f;
    const depth = axis === 0 ? x : axis === 1 ? y : z;
    const u = axis === 0 ? y : axis === 1 ? x : x;
    const v = axis === 0 ? z : axis === 1 ? z : y;
    const fo = FACE_OFFSETS[axis * 2 + (sign === 1 ? 0 : 1)];
    const [nx, ny, nz] = fo.n;
    const faceOffset = 0.5 * sign;

    const cornerUV: [number, number][] = [
      [u, v],
      [u + 1, v],
      [u + 1, v + 1],
      [u, v + 1]
    ];
    for (let ci = 0; ci < 4; ci++) {
      const [cu, cv] = cornerUV[ci];
      const ao = getCornerAO(axis, sign, depth, cu, cv, ci, voxelSet);
      let wx: number, wy: number, wz: number;
      if (axis === 0) {
        wx = depth + faceOffset;
        wy = cu - 0.5;
        wz = cv - 0.5;
      } else if (axis === 1) {
        wx = cu - 0.5;
        wy = depth + faceOffset;
        wz = cv - 0.5;
      } else {
        wx = cu - 0.5;
        wy = cv - 0.5;
        wz = depth + faceOffset;
      }
      const key = vertexKey(wx, wy, wz, nx, ny, nz);
      const existing = aoMap.get(key);
      aoMap.set(key, existing === undefined ? ao : Math.min(existing, ao));
    }
  }
  return aoMap;
}

function greedyMerge(cells: [number, number][]): { u: number; v: number; w: number; h: number }[] {
  const set = new Set(cells.map((c) => `${c[0]},${c[1]}`));
  const quads: { u: number; v: number; w: number; h: number }[] = [];
  const consumed = new Set<string>();

  for (const [u, v] of cells) {
    const k = `${u},${v}`;
    if (consumed.has(k)) continue;
    let w = 1;
    while (set.has(`${u + w},${v}`) && !consumed.has(`${u + w},${v}`)) w++;
    let h = 1;
    row: while (true) {
      for (let i = 0; i < w; i++) {
        if (!set.has(`${u + i},${v + h}`) || consumed.has(`${u + i},${v + h}`)) break row;
      }
      h++;
    }
    for (let dv = 0; dv < h; dv++)
      for (let du = 0; du < w; du++) consumed.add(`${u + du},${v + dv}`);
    quads.push({ u, v, w, h });
  }
  return quads;
}

function weldVertices(
  positions: number[],
  normals: number[],
  colors: number[]
): { positions: Float32Array; normals: Float32Array; colors: Float32Array; indices: Uint32Array } {
  const map = new Map<string, number>();
  const outPos: number[] = [];
  const outNorm: number[] = [];
  const outCol: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    const nx = normals[i];
    const ny = normals[i + 1];
    const nz = normals[i + 2];

    const key = vertexKey(x, y, z, nx, ny, nz);
    const existing = map.get(key);
    if (existing !== undefined) {
      indices.push(existing);
    } else {
      const idx = outPos.length / 3;
      map.set(key, idx);
      outPos.push(x, y, z);
      outNorm.push(nx, ny, nz);
      outCol.push(colors[i], colors[i + 1], colors[i + 2]);
      indices.push(idx);
    }
  }

  return {
    positions: new Float32Array(outPos),
    normals: new Float32Array(outNorm),
    colors: new Float32Array(outCol),
    indices: new Uint32Array(indices)
  };
}

export type AOStrength = 0 | 1 | 2; // 0 = off, 1 = subtle, 2 = strong

export interface GreedyMeshCoreOptions {
  /** @deprecated use aoStrength instead */
  aoEnabled?: boolean;
  /** 0 = off, 1 = subtle, 2 = strong. Default 2 when aoEnabled was used. */
  aoStrength?: AOStrength;
  /** When true, emit one quad per visible face (no slice/merge). Faster for previews. */
  skipMerge?: boolean;
}

export interface GreedyMeshCoreResult {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

/**
 * Pure greedy mesh computation. Returns raw typed arrays per color.
 * No Three.js dependency — safe to run in a Web Worker.
 */
export function computeGreedyMesh(
  voxels: Map<string, number>,
  options: GreedyMeshCoreOptions = {}
): Map<number, GreedyMeshCoreResult> {
  const strength: AOStrength = options.aoStrength ?? (options.aoEnabled === false ? 0 : 2);
  const aoEnabled = strength > 0;
  const aoValues = strength > 0 ? AO_PRESETS[strength as 1 | 2] : AO_PRESETS[2];
  const voxelSet = new Set(voxels.keys());
  const byColor = new Map<number, Vec3[]>();
  for (const [key, col] of voxels) {
    if (!byColor.has(col)) byColor.set(col, []);
    byColor.get(col)!.push(parseCoordKey(key));
  }

  const result = new Map<number, GreedyMeshCoreResult>();

  for (const [col, positions] of byColor) {
    const faces: { pos: Vec3; axis: number; sign: number }[] = [];

    for (const pos of positions) {
      for (let i = 0; i < 6; i++) {
        const axis = Math.floor(i / 2);
        const sign = i % 2 === 0 ? 1 : -1;
        if (!hasNeighbor(pos, axis, sign, voxelSet)) {
          faces.push({ pos: [...pos], axis, sign });
        }
      }
    }

    const vertexAO = aoEnabled ? precomputeVertexAO(faces, voxelSet) : new Map<string, number>();

    const quads: { n: Vec3; u: Vec3; v: Vec3; p: Vec3; w: number; h: number }[] = [];

    if (options.skipMerge) {
      for (const f of faces) {
        const [x, y, z] = f.pos;
        const { axis, sign } = f;
        const depth = axis === 0 ? x : axis === 1 ? y : z;
        const u = axis === 0 ? y : axis === 1 ? x : x;
        const v = axis === 0 ? z : axis === 1 ? z : y;
        const fo = FACE_OFFSETS[axis * 2 + (sign === 1 ? 0 : 1)];
        quads.push({
          n: fo.n,
          u: fo.u,
          v: fo.v,
          p: quadPositionFromSlice(axis, sign, depth, u, v, 1, 1),
          w: 1,
          h: 1
        });
      }
    } else {
      const slices = new Map<string, { depth: number; cells: Set<string> }>();
      for (const f of faces) {
        const [x, y, z] = f.pos;
        const depth = f.axis === 0 ? x : f.axis === 1 ? y : z;
        const u = f.axis === 0 ? y : f.axis === 1 ? x : x;
        const v = f.axis === 0 ? z : f.axis === 1 ? z : y;
        const key = `${f.axis},${f.sign},${depth}`;
        if (!slices.has(key)) slices.set(key, { depth, cells: new Set() });
        slices.get(key)!.cells.add(`${u},${v}`);
      }

      for (const [key, slice] of slices) {
        const [axis, sign, depth] = key.split(',').map(Number);
        const fo = FACE_OFFSETS[axis * 2 + (sign === 1 ? 0 : 1)];
        const cells = Array.from(slice.cells).map(
          (c) => c.split(',').map(Number) as [number, number]
        );
        const merged = greedyMerge(cells);
        for (const { u, v, w, h } of merged) {
          quads.push({
            n: fo.n,
            u: fo.u,
            v: fo.v,
            p: quadPositionFromSlice(axis, sign, depth, u, v, w, h),
            w,
            h
          });
        }
      }
    }

    const verts: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const r = ((col >> 16) & 0xff) / 255;
    const g = ((col >> 8) & 0xff) / 255;
    const b = (col & 0xff) / 255;

    for (const q of quads) {
      const [px, py, pz] = q.p;
      const [nx, ny, nz] = q.n;
      const [ux, uy, uz] = q.u;
      const [vx, vy, vz] = q.v;
      const faceIdx = FACE_OFFSETS.findIndex(
        (f) => f.n[0] === nx && f.n[1] === ny && f.n[2] === nz
      );
      const axis = Math.floor(faceIdx / 2);
      const sign = faceIdx % 2 === 0 ? 1 : -1;
      const depth = Math.round(
        axis === 0 ? px - sign * 0.5 : axis === 1 ? py - sign * 0.5 : pz - sign * 0.5
      );
      const u0 = axis === 0 ? Math.floor(py + 0.5) : Math.floor(px + 0.5);
      const v0 = axis === 2 ? Math.floor(py + 0.5) : Math.floor(pz + 0.5);

      const getAO = (cu: number, cv: number, ci: number): number => {
        const k = vertexKey(
          axis === 0 ? depth + 0.5 * sign : cu - 0.5,
          axis === 1 ? depth + 0.5 * sign : axis === 0 ? cu - 0.5 : cv - 0.5,
          axis === 2 ? depth + 0.5 * sign : cv - 0.5,
          nx,
          ny,
          nz
        );
        return vertexAO.get(k) ?? getCornerAO(axis, sign, depth, cu, cv, ci, voxelSet);
      };

      const signN = nx !== 0 ? nx : ny !== 0 ? ny : nz;
      const ccw = signN > 0 !== (ny !== 0);

      const emitTri = (t: number[][], tao: number[]) => {
        for (let i = 0; i < 3; i++) {
          verts.push(t[i][0], t[i][1], t[i][2]);
          normals.push(nx, ny, nz);
          const m = aoEnabled ? aoStateToMultiplier(tao[i], aoValues) : 1;
          colors.push(r * m, g * m, b * m);
        }
      };

      if (aoEnabled && (q.w > 1 || q.h > 1)) {
        // Subdivide quad for smooth AO: one vertex per (u,v) grid point, two triangles per 1x1 cell
        const faceOffset = 0.5 * sign;
        const gridW = q.w + 1;
        const gridH = q.h + 1;
        const positions: number[][] = [];
        const aoGrid: number[] = [];
        for (let j = 0; j < gridH; j++) {
          for (let i = 0; i < gridW; i++) {
            const cu = u0 + i;
            const cv = v0 + j;
            let vx_: number, vy_: number, vz_: number;
            if (axis === 0) {
              vx_ = depth + faceOffset;
              vy_ = cu - 0.5;
              vz_ = cv - 0.5;
            } else if (axis === 1) {
              vx_ = cu - 0.5;
              vy_ = depth + faceOffset;
              vz_ = cv - 0.5;
            } else {
              vx_ = cu - 0.5;
              vy_ = cv - 0.5;
              vz_ = depth + faceOffset;
            }
            positions.push([vx_, vy_, vz_]);
            aoGrid.push(getAO(cu, cv, 0));
          }
        }
        const idx = (i: number, j: number) => j * gridW + i;
        for (let j = 0; j < q.h; j++) {
          for (let i = 0; i < q.w; i++) {
            const v00 = positions[idx(i, j)];
            const v10 = positions[idx(i + 1, j)];
            const v11 = positions[idx(i + 1, j + 1)];
            const v01 = positions[idx(i, j + 1)];
            const a00 = aoGrid[idx(i, j)];
            const a10 = aoGrid[idx(i + 1, j)];
            const a11 = aoGrid[idx(i + 1, j + 1)];
            const a01 = aoGrid[idx(i, j + 1)];
            const tri1 = [v00, v10, v11];
            const tri2 = [v00, v11, v01];
            const tri1ao = [a00, a10, a11];
            const tri2ao = [a00, a11, a01];
            if (!ccw) {
              tri1.reverse();
              tri2.reverse();
              tri1ao.reverse();
              tri2ao.reverse();
            }
            emitTri(tri1, tri1ao);
            emitTri(tri2, tri2ao);
          }
        }
      } else {
        const aos: number[] = aoEnabled
          ? [
              getAO(u0, v0, 0),
              getAO(u0 + q.w, v0, 1),
              getAO(u0 + q.w, v0 + q.h, 2),
              getAO(u0, v0 + q.h, 3)
            ]
          : [0, 0, 0, 0];

        const v0p = [px, py, pz];
        const v1p = [px + ux * q.w, py + uy * q.w, pz + uz * q.w];
        const v2p = [px + ux * q.w + vx * q.h, py + uy * q.w + vy * q.h, pz + uz * q.w + vz * q.h];
        const v3p = [px + vx * q.h, py + vy * q.h, pz + vz * q.h];
        const sum02 = aoStateToMultiplier(aos[0], aoValues) + aoStateToMultiplier(aos[2], aoValues);
        const sum13 = aoStateToMultiplier(aos[1], aoValues) + aoStateToMultiplier(aos[3], aoValues);
        const flip = sum02 - sum13 > 0.2;
        let tri1 = flip ? [v0p, v1p, v3p] : [v0p, v1p, v2p];
        let tri2 = flip ? [v1p, v2p, v3p] : [v0p, v2p, v3p];
        let tri1ao = flip ? [aos[0], aos[1], aos[3]] : [aos[0], aos[1], aos[2]];
        let tri2ao = flip ? [aos[1], aos[2], aos[3]] : [aos[0], aos[2], aos[3]];
        if (!ccw) {
          tri1 = [tri1[0], tri1[2], tri1[1]];
          tri2 = [tri2[0], tri2[2], tri2[1]];
          tri1ao = [tri1ao[0], tri1ao[2], tri1ao[1]];
          tri2ao = [tri2ao[0], tri2ao[2], tri2ao[1]];
        }
        emitTri(tri1, tri1ao);
        emitTri(tri2, tri2ao);
      }
    }

    const welded = weldVertices(verts, normals, colors);
    result.set(col, welded);
  }

  return result;
}

/** Returns total quad area (sum of w*h) for each color. Used by tests. */
export function getGreedyMeshFaceArea(voxels: Map<string, number>): Map<number, number> {
  const voxelSet = new Set(voxels.keys());
  const byColor = new Map<number, Vec3[]>();
  for (const [key, col] of voxels) {
    if (!byColor.has(col)) byColor.set(col, []);
    byColor.get(col)!.push(parseCoordKey(key));
  }
  const result = new Map<number, number>();
  for (const [col, positions] of byColor) {
    const faces: { pos: Vec3; axis: number; sign: number }[] = [];
    for (const pos of positions) {
      for (let i = 0; i < 6; i++) {
        const axis = Math.floor(i / 2);
        const sign = i % 2 === 0 ? 1 : -1;
        if (!hasNeighbor(pos, axis, sign, voxelSet)) faces.push({ pos: [...pos], axis, sign });
      }
    }
    const slices = new Map<string, { cells: Set<string> }>();
    for (const f of faces) {
      const [x, y, z] = f.pos;
      const depth = f.axis === 0 ? x : f.axis === 1 ? y : z;
      const u = f.axis === 0 ? y : f.axis === 1 ? x : x;
      const v = f.axis === 0 ? z : f.axis === 1 ? z : y;
      const key = `${f.axis},${f.sign},${depth}`;
      if (!slices.has(key)) slices.set(key, { cells: new Set() });
      slices.get(key)!.cells.add(`${u},${v}`);
    }
    let totalArea = 0;
    for (const [, slice] of slices) {
      const cells = Array.from(slice.cells).map(
        (c) => c.split(',').map(Number) as [number, number]
      );
      for (const { w, h } of greedyMerge(cells)) totalArea += w * h;
    }
    result.set(col, totalArea);
  }
  return result;
}
