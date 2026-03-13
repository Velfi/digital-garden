/**
 * Greedy meshing (culled meshing) for voxels.
 * Only emits visible faces and merges adjacent coplanar faces into larger quads.
 * Supports vertex ambient occlusion (VAO) per 0fps / Minecraft-style algorithm.
 */
import * as THREE from 'three';
import { coordKey, parseCoordKey } from './store';

type Vec3 = [number, number, number];

/** AO values for states 0–3: 0=full occlusion, 3=no occlusion.
 * Kept subtle per Barrett (nothings.org/gamedev/ssao): real corner darkening is mild. */
const AO_VALUES = [0.85, 0.92, 0.96, 1.0];

/** For each of 4 quad corners (u,v), (u+w,v), (u+w,v+h), (u,v+h): [du1,dv1, du2,dv2, du3,dv3] for the 3 neighbor (u,v) deltas in the slice; depth delta is +1 for +axis, -1 for -axis. */
const AO_NEIGHBORS: [number, number][][] = [
  // corner 0: (u,v) — neighbors (u-1,v), (u,v-1), (u-1,v-1)
  [
    [-1, 0],
    [0, -1],
    [-1, -1]
  ],
  // corner 1: (u+w,v) — (u+w+1,v), (u+w,v-1), (u+w+1,v-1)
  [
    [1, 0],
    [0, -1],
    [1, -1]
  ],
  // corner 2: (u+w,v+h) — (u+w+1,v+h), (u+w,v+h+1), (u+w+1,v+h+1)
  [
    [1, 0],
    [0, 1],
    [1, 1]
  ],
  // corner 3: (u,v+h) — (u-1,v+h), (u,v+h+1), (u-1,v+h+1)
  [
    [-1, 0],
    [0, 1],
    [-1, 1]
  ]
];

const FACE_OFFSETS: { n: Vec3; u: Vec3; v: Vec3 }[] = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, // +X
  { n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, // -X
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] }, // +Y
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }, // -Y
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, // +Z
  { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] } // -Z
];

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

/** Get AO state (0–3) from neighbor occupancy. 0=fully occluded, 3=fully lit. */
function getAOState(side1: number, side2: number, corner: number): number {
  if (side1 && side2) return 0; // both sides blocked => no AO
  return 3 - (side1 + side2 + corner);
}

/** Get world (x,y,z) for the 3 AO neighbors of a corner. axis 0=x,1=y,2=z; sign ±1.
 * Neighbors must be in the same slice as the face (depth), not the adjacent slice. */
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
    // AO neighbors must be sampled on the exterior side of the face.
    // Using the source voxel slice causes interior geometry to darken smooth exteriors.
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

/** Convert AO state to multiplier (1=no darkening, lower=more occlusion). */
function aoStateToMultiplier(state: number): number {
  return AO_VALUES[state];
}

/** Tolerance for vertex position comparison when welding. */
const WELD_EPS = 1e-6;

function vertexKey(x: number, y: number, z: number, nx: number, ny: number, nz: number): string {
  const q = (v: number) => Math.round(v / WELD_EPS) * WELD_EPS;
  return `${q(x)},${q(y)},${q(z)},${nx},${ny},${nz}`;
}

/**
 * Precompute vertex AO for all visible face corners, before greedy merge.
 * Returns Map<vertexKey, aoState>. Uses min when a vertex is shared by multiple faces.
 * This ensures AO is driven by voxel geometry, not tessellation structure.
 */
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

/**
 * Weld duplicate vertices (same position + normal). AO is already determined by precompute;
 * keep first value when deduplicating—do not overwrite with min, which would re-apply AO
 * after merging and cause artifacts (e.g. diffuse darkening from holes).
 */
function weldVertices(
  positions: number[],
  normals: number[],
  colors: number[],
  _baseR: number,
  _baseG: number,
  _baseB: number
): { positions: number[]; normals: number[]; colors: number[]; indices: number[] } {
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

  return { positions: outPos, normals: outNorm, colors: outCol, indices };
}

/**
 * Build BufferGeometry from voxels using greedy meshing.
 * Only visible (exterior) faces are emitted; adjacent same-color faces are merged.
 */
export interface GreedyMeshOptions {
  /** When false, vertex ambient occlusion is disabled (flat vertex colors). */
  aoEnabled?: boolean;
}

export function buildGreedyMesh(
  voxels: Map<string, number>,
  options: GreedyMeshOptions = {}
): Map<number, THREE.BufferGeometry> {
  const aoEnabled = options.aoEnabled !== false;
  const voxelSet = new Set(voxels.keys());
  const byColor = new Map<number, Vec3[]>();
  for (const [key, col] of voxels) {
    if (!byColor.has(col)) byColor.set(col, []);
    byColor.get(col)!.push(parseCoordKey(key));
  }

  const result = new Map<number, THREE.BufferGeometry>();

  for (const [col, positions] of byColor) {
    const faces: { pos: Vec3; axis: number; sign: number }[] = [];

    for (const pos of positions) {
      // Check each of 6 face directions
      for (let i = 0; i < 6; i++) {
        const axis = Math.floor(i / 2); // 0=x, 1=y, 2=z
        const sign = i % 2 === 0 ? 1 : -1;
        if (!hasNeighbor(pos, axis, sign, voxelSet)) {
          faces.push({ pos: [...pos], axis, sign });
        }
      }
    }

    // Precompute vertex AO from voxel geometry before tessellation
    const vertexAO = precomputeVertexAO(faces, voxelSet);

    // Group faces by (axis, sign, depth) for merging
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

    // Greedy merge each slice into rectangles
    const quads: { n: Vec3; u: Vec3; v: Vec3; p: Vec3; w: number; h: number }[] = [];
    for (const [key, slice] of slices) {
      const [axis, sign, depth] = key.split(',').map(Number);
      const fo = FACE_OFFSETS[axis * 2 + (sign === 1 ? 0 : 1)];
      const cells = Array.from(slice.cells).map(
        (c) => c.split(',').map(Number) as [number, number]
      );
      const merged = greedyMerge(cells);
      const faceOffset = 0.5 * sign; // +0.5 for +direction, -0.5 for -direction
      for (const { u, v, w, h } of merged) {
        let px: number, py: number, pz: number;
        if (axis === 0) {
          px = depth + faceOffset;
          py = u - 0.5;
          pz = v - 0.5;
        } else if (axis === 1) {
          px = u - 0.5;
          py = depth + faceOffset;
          pz = v - 0.5;
        } else {
          px = u - 0.5;
          py = v - 0.5;
          pz = depth + faceOffset;
        }
        quads.push({
          n: fo.n,
          u: fo.u,
          v: fo.v,
          p: [px, py, pz],
          w,
          h
        });
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
      const axis = Math.floor(faceIdx / 2); // 0=x, 1=y, 2=z
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
      const aos: number[] = [
        getAO(u0, v0, 0),
        getAO(u0 + q.w, v0, 1),
        getAO(u0 + q.w, v0 + q.h, 2),
        getAO(u0, v0 + q.h, 3)
      ];

      const v0p = [px, py, pz];
      const v1p = [px + ux * q.w, py + uy * q.w, pz + uz * q.w];
      const v2p = [px + ux * q.w + vx * q.h, py + uy * q.w + vy * q.h, pz + uz * q.w + vz * q.h];
      const v3p = [px + vx * q.h, py + vy * q.h, pz + vz * q.h];
      const signN = nx !== 0 ? nx : ny !== 0 ? ny : nz;
      const ccw = signN > 0 !== (ny !== 0);
      // Quad flip: put diagonal with lower AO sum on the seam (0fps)
      // Flip uses diagonal v1-v3 instead of v0-v2; both tris must stay CCW
      // Use high threshold to avoid inconsistent diagonals/ridges on flat surfaces
      const sum02 = aoStateToMultiplier(aos[0]) + aoStateToMultiplier(aos[2]);
      const sum13 = aoStateToMultiplier(aos[1]) + aoStateToMultiplier(aos[3]);
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
      const emitTri = (t: number[][], tao: number[]) => {
        for (let i = 0; i < 3; i++) {
          verts.push(t[i][0], t[i][1], t[i][2]);
          normals.push(nx, ny, nz);
          const m = aoEnabled ? aoStateToMultiplier(tao[i]) : 1;
          colors.push(r * m, g * m, b * m);
        }
      };
      emitTri(tri1, tri1ao);
      emitTri(tri2, tri2ao);
    }

    const welded = weldVertices(verts, normals, colors, r, g, b);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(welded.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(welded.normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(welded.colors, 3));
    geo.setIndex(new THREE.Uint32BufferAttribute(welded.indices, 1));
    geo.computeBoundingSphere();
    result.set(col, geo);
  }

  return result;
}

/** Returns total quad area (sum of w*h) for each color. Used by tests to verify face coverage. */
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

/** Greedy merge of 2D cells into rectangles. Returns {u, v, w, h} for each quad. */
function greedyMerge(cells: [number, number][]): { u: number; v: number; w: number; h: number }[] {
  const set = new Set(cells.map((c) => `${c[0]},${c[1]}`));
  const quads: { u: number; v: number; w: number; h: number }[] = [];
  const consumed = new Set<string>();

  for (const [u, v] of cells) {
    const k = `${u},${v}`;
    if (consumed.has(k)) continue;
    // Expand right (increase u)
    let w = 1;
    while (set.has(`${u + w},${v}`) && !consumed.has(`${u + w},${v}`)) w++;
    // Expand down (increase v)
    let h = 1;
    row: while (true) {
      for (let i = 0; i < w; i++) {
        if (!set.has(`${u + i},${v + h}`) || consumed.has(`${u + i},${v + h}`)) break row;
      }
      h++;
    }
    // Mark consumed
    for (let dv = 0; dv < h; dv++)
      for (let du = 0; du < w; du++) consumed.add(`${u + du},${v + dv}`);
    quads.push({ u, v, w, h });
  }
  return quads;
}
