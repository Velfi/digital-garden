import {
  coordKey,
  getBoundsFromPositions,
  inBounds,
  inBoundsBox,
  type SelectionBounds
} from './coordUtils';
import * as THREE from 'three';
import { computeGreedyMesh } from './greedyMeshCore';
import type { Voxel } from './voxelMaterial';
import { cloneVoxel } from './voxelMaterial';
import { applySmooth } from './sculptOps';

const _triA = new THREE.Vector3();
const _triB = new THREE.Vector3();
const _triC = new THREE.Vector3();
const _rayHit = new THREE.Vector3();

const EPS = 1e-5;
const PROXY_VOXEL: Voxel = { color: 0x888888, material: 'plastic' };

/** Skip mesh Laplacian when ROI cell count exceeds this; falls back to majority smooth. */
export const MAX_LAPLACIAN_ROI_CELLS = 70_000;

export type ApplyMeshLaplacianSmoothOptions = {
  /** Expands brush bbox by this margin (voxels) before clamping to world bounds. */
  neighborMargin: number;
  iterations: number;
  /** 0–100, scales Taubin λ/μ. */
  relaxPct: number;
  majorityNeighborRadius: number;
  majorityAggressiveness: number;
};

function withinWorld(
  x: number,
  y: number,
  z: number,
  gridSizeOrBounds: number | SelectionBounds
): boolean {
  if (typeof gridSizeOrBounds === 'number') return inBounds(x, y, z, gridSizeOrBounds);
  return inBoundsBox(x, y, z, gridSizeOrBounds);
}

function clampRoiToWorld(
  roi: SelectionBounds,
  gridSizeOrBounds: number | SelectionBounds
): SelectionBounds {
  if (typeof gridSizeOrBounds === 'number') {
    const n = gridSizeOrBounds;
    return {
      minX: Math.max(0, roi.minX),
      minY: Math.max(0, roi.minY),
      minZ: Math.max(0, roi.minZ),
      maxX: Math.min(n - 1, roi.maxX),
      maxY: Math.min(n - 1, roi.maxY),
      maxZ: Math.min(n - 1, roi.maxZ)
    };
  }
  return {
    minX: Math.max(gridSizeOrBounds.minX, roi.minX),
    minY: Math.max(gridSizeOrBounds.minY, roi.minY),
    minZ: Math.max(gridSizeOrBounds.minZ, roi.minZ),
    maxX: Math.min(gridSizeOrBounds.maxX, roi.maxX),
    maxY: Math.min(gridSizeOrBounds.maxY, roi.maxY),
    maxZ: Math.min(gridSizeOrBounds.maxZ, roi.maxZ)
  };
}

function roiCellCount(roi: SelectionBounds): number {
  const w = roi.maxX - roi.minX + 1;
  const h = roi.maxY - roi.minY + 1;
  const d = roi.maxZ - roi.minZ + 1;
  return w * h * d;
}

function expandBounds(b: SelectionBounds, m: number): SelectionBounds {
  return {
    minX: b.minX - m,
    minY: b.minY - m,
    minZ: b.minZ - m,
    maxX: b.maxX + m,
    maxY: b.maxY + m,
    maxZ: b.maxZ + m
  };
}

function buildRoiFromBrush(
  brushPositions: [number, number, number][],
  margin: number,
  gridSizeOrBounds: number | SelectionBounds
): SelectionBounds | null {
  const raw = getBoundsFromPositions(brushPositions);
  if (!raw) return null;
  const expanded = expandBounds(raw, margin);
  const roi = clampRoiToWorld(expanded, gridSizeOrBounds);
  if (roi.minX > roi.maxX || roi.minY > roi.maxY || roi.minZ > roi.maxZ) return null;
  return roi;
}

function extractProxyInRoi(
  v: Map<string, Voxel>,
  roi: SelectionBounds,
  gridSizeOrBounds: number | SelectionBounds
): Map<string, Voxel> {
  const proxy = new Map<string, Voxel>();
  for (let x = roi.minX; x <= roi.maxX; x++) {
    for (let y = roi.minY; y <= roi.maxY; y++) {
      for (let z = roi.minZ; z <= roi.maxZ; z++) {
        if (!withinWorld(x, y, z, gridSizeOrBounds)) continue;
        const k = coordKey(x, y, z);
        if (v.has(k)) proxy.set(k, cloneVoxel(PROXY_VOXEL));
      }
    }
  }
  return proxy;
}

export function mergeGreedyMeshBuckets(
  meshByBucket: ReturnType<typeof computeGreedyMesh>
): { positions: Float32Array; indices: Uint32Array } | null {
  if (meshByBucket.size === 0) return null;
  let vOff = 0;
  const posChunks: number[] = [];
  const idxChunks: number[] = [];
  for (const [, data] of meshByBucket) {
    const n = data.positions.length / 3;
    if (n === 0 || data.indices.length === 0) continue;
    for (let i = 0; i < data.positions.length; i++) posChunks.push(data.positions[i]!);
    for (let i = 0; i < data.indices.length; i++) {
      idxChunks.push(data.indices[i]! + vOff);
    }
    vOff += n;
  }
  if (posChunks.length === 0 || idxChunks.length === 0) return null;
  return {
    positions: new Float32Array(posChunks),
    indices: new Uint32Array(idxChunks)
  };
}

function buildAdjacency(vertexCount: number, indices: Uint32Array): Set<number>[] {
  const adj: Set<number>[] = Array.from({ length: vertexCount }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]!,
      b = indices[t + 1]!,
      c = indices[t + 2]!;
    adj[a]!.add(b);
    adj[a]!.add(c);
    adj[b]!.add(a);
    adj[b]!.add(c);
    adj[c]!.add(a);
    adj[c]!.add(b);
  }
  return adj;
}

function isPinnedVertex(px: number, py: number, pz: number, roi: SelectionBounds): boolean {
  const onX = px - roi.minX < EPS || roi.maxX + 1 - px < EPS;
  const onY = py - roi.minY < EPS || roi.maxY + 1 - py < EPS;
  const onZ = pz - roi.minZ < EPS || roi.maxZ + 1 - pz < EPS;
  return onX || onY || onZ;
}

function umbrellaLaplacianStep(
  pos: Float64Array,
  adj: Set<number>[],
  pinned: boolean[],
  lambda: number
): void {
  const n = pos.length / 3;
  const nx = new Float64Array(pos.length);
  nx.set(pos);
  for (let i = 0; i < n; i++) {
    if (pinned[i]) continue;
    const nb = adj[i]!;
    if (nb.size === 0) continue;
    let sx = 0,
      sy = 0,
      sz = 0;
    for (const j of nb) {
      sx += pos[j * 3]!;
      sy += pos[j * 3 + 1]!;
      sz += pos[j * 3 + 2]!;
    }
    const k = nb.size;
    const lx = sx / k - pos[i * 3]!;
    const ly = sy / k - pos[i * 3 + 1]!;
    const lz = sz / k - pos[i * 3 + 2]!;
    nx[i * 3] = pos[i * 3]! + lambda * lx;
    nx[i * 3 + 1] = pos[i * 3 + 1]! + lambda * ly;
    nx[i * 3 + 2] = pos[i * 3 + 2]! + lambda * lz;
  }
  pos.set(nx);
}

function taubinSmoothMesh(
  positions: Float32Array,
  indices: Uint32Array,
  roi: SelectionBounds,
  iterations: number,
  relaxPct: number
): Float64Array {
  const n = positions.length / 3;
  const pos = new Float64Array(positions.length);
  for (let i = 0; i < positions.length; i++) pos[i] = positions[i]!;

  const adj = buildAdjacency(n, indices);
  const pinned = new Array<boolean>(n);
  for (let i = 0; i < n; i++) {
    pinned[i] = isPinnedVertex(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!, roi);
  }

  const s = Math.min(100, Math.max(0, relaxPct)) / 100;
  const lambda = 0.33 * s;
  const mu = -0.34 * s;
  const iters = Math.min(20, Math.max(1, Math.floor(iterations)));

  for (let it = 0; it < iters; it++) {
    if (lambda > 1e-8) umbrellaLaplacianStep(pos, adj, pinned, lambda);
    if (mu < -1e-8) umbrellaLaplacianStep(pos, adj, pinned, mu);
  }
  return pos;
}

const T_MERGE_EPS = 1e-4;

const _hitDelta = new THREE.Vector3();

/** Parity along a unit direction; merges hits by param t = dot(hit - origin, dir). */
function countRayHitsDirected(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  pos: Float64Array,
  indices: Uint32Array
): number {
  const origin = new THREE.Vector3(ox, oy, oz);
  const direction = new THREE.Vector3(dx, dy, dz).normalize();
  const ray = new THREE.Ray(origin, direction);
  const ts: number[] = [];
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t]! * 3;
    const i1 = indices[t + 1]! * 3;
    const i2 = indices[t + 2]! * 3;
    _triA.set(pos[i0]!, pos[i0 + 1]!, pos[i0 + 2]!);
    _triB.set(pos[i1]!, pos[i1 + 1]!, pos[i1 + 2]!);
    _triC.set(pos[i2]!, pos[i2 + 1]!, pos[i2 + 2]!);
    const hit = ray.intersectTriangle(_triA, _triB, _triC, false, _rayHit);
    if (hit !== null) {
      _hitDelta.subVectors(_rayHit, origin);
      const w = _hitDelta.dot(direction);
      if (w > T_MERGE_EPS) ts.push(w);
    }
  }
  if (ts.length === 0) return 0;
  ts.sort((a, b) => a - b);
  let crossings = 0;
  let last = -Infinity;
  for (const t of ts) {
    if (t - last > T_MERGE_EPS) {
      crossings++;
      last = t;
    }
  }
  return crossings;
}

/** +X ray; exported for tests. */
export function countRayHitsPlusX(
  ox: number,
  oy: number,
  oz: number,
  pos: Float64Array,
  indices: Uint32Array
): number {
  return countRayHitsDirected(ox, oy, oz, 1, 0, 0, pos, indices);
}

export function vertexAxisBounds(pos: Float64Array): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const px = pos[i]!,
      py = pos[i + 1]!,
      pz = pos[i + 2]!;
    minX = Math.min(minX, px);
    maxX = Math.max(maxX, px);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
    minZ = Math.min(minZ, pz);
    maxZ = Math.max(maxZ, pz);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

const BBOX_PAD = 0.51;

/** Cell center inside padded axis bounds of mesh vertices (fallback when ray parity misses merged quads). */
function cellInVertexBBox(
  x: number,
  y: number,
  z: number,
  b: ReturnType<typeof vertexAxisBounds>
): boolean {
  const cx = x + 0.5,
    cy = y + 0.5,
    cz = z + 0.5;
  return (
    cx >= b.minX - BBOX_PAD &&
    cx <= b.maxX + BBOX_PAD &&
    cy >= b.minY - BBOX_PAD &&
    cy <= b.maxY + BBOX_PAD &&
    cz >= b.minZ - BBOX_PAD &&
    cz <= b.maxZ + BBOX_PAD
  );
}

/**
 * Point-in-mesh for revoxelization: +X ray parity plus optional proxy+bbox fallback
 * (`wasSolid` = cell had occupancy in the proxy used to build this mesh).
 */
export function voxelCellInsideMesh(
  x: number,
  y: number,
  z: number,
  pos: Float64Array,
  indices: Uint32Array,
  opts?: { wasSolid?: boolean; vertexBounds?: ReturnType<typeof vertexAxisBounds> }
): boolean {
  const ox = x + 0.5 + 1e-4;
  const oy = y + 0.5 + 2e-4;
  const oz = z + 0.5 + 3e-4;
  if (countRayHitsDirected(ox, oy, oz, 1, 0, 0, pos, indices) % 2 === 1) return true;
  if (opts?.wasSolid && opts.vertexBounds && cellInVertexBBox(x, y, z, opts.vertexBounds)) {
    return true;
  }
  return false;
}

type OriginalSample = { x: number; y: number; z: number; voxel: Voxel };

function collectOriginalsInRoi(v: Map<string, Voxel>, roi: SelectionBounds): OriginalSample[] {
  const out: OriginalSample[] = [];
  for (let x = roi.minX; x <= roi.maxX; x++) {
    for (let y = roi.minY; y <= roi.maxY; y++) {
      for (let z = roi.minZ; z <= roi.maxZ; z++) {
        const k = coordKey(x, y, z);
        const vx = v.get(k);
        if (vx !== undefined) out.push({ x, y, z, voxel: vx });
      }
    }
  }
  return out;
}

function nearestOriginalVoxel(cx: number, cy: number, cz: number, originals: OriginalSample[]): Voxel | null {
  if (originals.length === 0) return null;
  let bestD = Infinity;
  let best: Voxel | null = null;
  for (const o of originals) {
    const dx = cx - (o.x + 0.5);
    const dy = cy - (o.y + 0.5);
    const dz = cz - (o.z + 0.5);
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = o.voxel;
    }
  }
  return best;
}

/**
 * Mesh Taubin smooth on a local greedy mesh (occupancy proxy + full-map occlusion), then revoxelize inside ROI.
 * Falls back to `applySmooth` when ROI is too large or mesh is empty.
 */
export function applyMeshLaplacianSmooth(
  v: Map<string, Voxel>,
  brushPositions: [number, number, number][],
  gridSizeOrBounds: number | SelectionBounds,
  options: ApplyMeshLaplacianSmoothOptions,
  getVoxel: (x: number, y: number, z: number) => Voxel
): { toAdd: Map<string, Voxel>; toRemove: Set<string> } {
  const margin = Math.max(0, Math.floor(options.neighborMargin));
  const roi = buildRoiFromBrush(brushPositions, margin, gridSizeOrBounds);
  if (!roi || roiCellCount(roi) > MAX_LAPLACIAN_ROI_CELLS) {
    return applySmooth(v, brushPositions, gridSizeOrBounds, {
      neighborRadius: options.majorityNeighborRadius,
      aggressiveness: options.majorityAggressiveness
    });
  }

  const proxy = extractProxyInRoi(v, roi, gridSizeOrBounds);
  if (proxy.size === 0) {
    return { toAdd: new Map(), toRemove: new Set() };
  }

  const meshByBucket = computeGreedyMesh(proxy, {
    aoStrength: 0,
    occlusionVoxels: v
  });
  const merged = mergeGreedyMeshBuckets(meshByBucket);
  if (!merged) {
    return applySmooth(v, brushPositions, gridSizeOrBounds, {
      neighborRadius: options.majorityNeighborRadius,
      aggressiveness: options.majorityAggressiveness
    });
  }

  const { positions, indices } = merged;
  if (indices.length < 3) {
    return applySmooth(v, brushPositions, gridSizeOrBounds, {
      neighborRadius: options.majorityNeighborRadius,
      aggressiveness: options.majorityAggressiveness
    });
  }

  const smoothed = taubinSmoothMesh(positions, indices, roi, options.iterations, options.relaxPct);
  const vb = vertexAxisBounds(smoothed);
  const originals = collectOriginalsInRoi(v, roi);

  const toRemove = new Set<string>();
  const toAdd = new Map<string, Voxel>();

  for (let x = roi.minX; x <= roi.maxX; x++) {
    for (let y = roi.minY; y <= roi.maxY; y++) {
      for (let z = roi.minZ; z <= roi.maxZ; z++) {
        if (!withinWorld(x, y, z, gridSizeOrBounds)) continue;
        const k = coordKey(x, y, z);
        if (v.has(k)) toRemove.add(k);
      }
    }
  }

  for (let x = roi.minX; x <= roi.maxX; x++) {
    for (let y = roi.minY; y <= roi.maxY; y++) {
      for (let z = roi.minZ; z <= roi.maxZ; z++) {
        if (!withinWorld(x, y, z, gridSizeOrBounds)) continue;
        const k = coordKey(x, y, z);
        if (
          !voxelCellInsideMesh(x, y, z, smoothed, indices, {
            wasSolid: proxy.has(k),
            vertexBounds: vb
          })
        ) {
          continue;
        }
        const near = nearestOriginalVoxel(x + 0.5, y + 0.5, z + 0.5, originals);
        const voxel = near !== null ? cloneVoxel(near) : cloneVoxel(getVoxel(x, y, z));
        toAdd.set(k, voxel);
      }
    }
  }

  return { toAdd, toRemove };
}
