import * as THREE from 'three';
import type {
  BranchEndCap,
  BranchBrushProfile,
  ConstrainToPlaneRef,
  SculptBrushShape,
  SculptMode,
  DrawBrushShape,
  StrokeMode
} from './store/core';
import { SCULPT_PATH_THICKEN_MODES } from './store/sculptModes';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { parseCoordKey } from './coordUtils';

export type Vec3Like = { x: number; y: number; z: number };

const NEIGHBORS6: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
];

/** 4-neighbors in the plane normal to world X, Y, or Z (fixed axis index 0|1|2). */
function neighborsInFixedPlane(fixedAxis: 0 | 1 | 2): [number, number, number][] {
  if (fixedAxis === 0)
    return [
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1]
    ];
  if (fixedAxis === 1)
    return [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 0, 1],
      [0, 0, -1]
    ];
  return [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0]
  ];
}

/**
 * Voxels within `thickness` layers of the solid boundary (morphological shell).
 * `thickness` 1 = outer boundary only; larger values include inward bands.
 */
function hollowSolidToShell(
  solid: [number, number, number][],
  thickness: number,
  neighbors: [number, number, number][]
): [number, number, number][] {
  const t = Math.max(1, Math.floor(thickness));
  if (solid.length === 0) return [];
  let r = new Set(solid.map((p) => `${p[0]},${p[1]},${p[2]}`));
  for (let i = 0; i < t; i++) {
    if (r.size === 0) break;
    const next = new Set<string>();
    for (const ks of r) {
      const [x, y, z] = parseCoordKey(ks);
      let allInside = true;
      for (const [dx, dy, dz] of neighbors) {
        const nk = `${x + dx},${y + dy},${z + dz}`;
        if (!r.has(nk)) {
          allInside = false;
          break;
        }
      }
      if (allInside) next.add(ks);
    }
    r = next;
  }
  const core = r;
  return solid.filter((p) => !core.has(`${p[0]},${p[1]},${p[2]}`));
}

/** Path from origin stepping along direction for length voxel steps. Direction is normalized. */
export function getRayDirectionPath(
  origin: [number, number, number],
  direction: Vec3Like,
  length: number
): [number, number, number][] {
  if (length <= 0) return [origin];
  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-9) return [origin];
  const ndx = dx / len;
  const ndy = dy / len;
  const ndz = dz / len;
  const positions: [number, number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= length; i++) {
    const x = Math.round(origin[0] + i * ndx);
    const y = Math.round(origin[1] + i * ndy);
    const z = Math.round(origin[2] + i * ndz);
    const k = `${x},${y},${z}`;
    if (!seen.has(k)) {
      seen.add(k);
      positions.push([x, y, z]);
    }
  }
  return positions;
}

/** Minimal camera API for branch extrude (matches Three.js Camera). */
export type BranchExtrudeCamera = {
  updateMatrixWorld(force?: boolean): void;
  getWorldDirection(target: THREE.Vector3): THREE.Vector3;
  up: THREE.Vector3;
};

function branchViewPlaneRaw(
  camera: BranchExtrudeCamera | null,
  screenDx: number,
  screenDy: number
): THREE.Vector3 {
  if (!camera) return new THREE.Vector3(0, 1, 0);
  camera.updateMatrixWorld(true);
  const viewDir = new THREE.Vector3();
  camera.getWorldDirection(viewDir);
  const right = new THREE.Vector3().crossVectors(viewDir, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, viewDir).normalize();
  return new THREE.Vector3()
    .addScaledVector(right, screenDx)
    .addScaledVector(up, screenDy);
}

function axisSignFromViewDrag(raw: THREE.Vector3, axis: Vec3Like): number {
  const d = raw.x * axis.x + raw.y * axis.y + raw.z * axis.z;
  if (Math.abs(d) < 1e-9) return 1;
  return d > 0 ? 1 : -1;
}

/**
 * World-space extrusion direction for sculpt branch (Extrude).
 * Camera = normalize(screen right/up in world); Auto = snapped face normal with sign from drag; X/Y/Z = world axis with sign from drag.
 */
export function resolveBranchExtrudeDirection(
  ref: ConstrainToPlaneRef,
  params: {
    camera: BranchExtrudeCamera | null;
    screenDx: number;
    screenDy: number;
    faceNormal: Vec3Like | null;
  }
): Vec3Like {
  const { camera, screenDx, screenDy, faceNormal } = params;
  const raw = branchViewPlaneRaw(camera, screenDx, screenDy);

  if (ref === 'camera') {
    const len = raw.length();
    if (len > 1e-6) {
      return { x: raw.x / len, y: raw.y / len, z: raw.z / len };
    }
    if (camera) {
      camera.updateMatrixWorld(true);
      const viewDir = new THREE.Vector3();
      camera.getWorldDirection(viewDir);
      const right = new THREE.Vector3().crossVectors(viewDir, camera.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, viewDir).normalize();
      return { x: up.x, y: up.y, z: up.z };
    }
    return { x: 0, y: 1, z: 0 };
  }

  if (ref === 'auto') {
    if (faceNormal) {
      const [ax, ay, az] = snapNormalToAxis(faceNormal);
      const axis = { x: ax, y: ay, z: az };
      const sign = axisSignFromViewDrag(raw, axis);
      return { x: ax * sign, y: ay * sign, z: az * sign };
    }
    return resolveBranchExtrudeDirection('camera', params);
  }

  const axisVec: Vec3Like =
    ref === 0 ? { x: 1, y: 0, z: 0 } : ref === 1 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const sign = axisSignFromViewDrag(raw, axisVec);
  return {
    x: axisVec.x * sign,
    y: axisVec.y * sign,
    z: axisVec.z * sign
  };
}

/** Map continuous radius to nearest discrete size (0, 0.5, 1, 1.5, 2, ..., up to 12 for 25 voxels). */
function taperRadiusToSize(c: number): number {
  if (c <= 0) return 0;
  if (c < 0.25) return 0;
  if (c < 0.75) return 0.5; // 2x2
  if (c < 1.25) return 1; // 3x3
  if (c < 1.75) return 1.5; // 4x4
  if (c <= 2) return 2;
  return c; // support larger radii (branch taper up to MAX_BRUSH_SIZE voxels)
}

/** Add voxels for a single path point with given size. Size 0=1x1, 0.5=2x2, 1+=cube radius. */
function addThickenPoint(
  px: number,
  py: number,
  pz: number,
  size: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  if (size === 0) {
    const k = `${px},${py},${pz}`;
    if (!seen.has(k)) {
      seen.add(k);
      result.push([px, py, pz]);
    }
    return;
  }
  if (size === 0.5) {
    for (let i = 0; i <= 1; i++) {
      for (let j = 0; j <= 1; j++) {
        for (let k = 0; k <= 1; k++) {
          const x = px + i;
          const y = py + j;
          const z = pz + k;
          const key = `${x},${y},${z}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push([x, y, z]);
          }
        }
      }
    }
    return;
  }
  const lo = -Math.ceil(size);
  const hi = Math.floor(size);
  for (let dx = lo; dx <= hi; dx++) {
    for (let dy = lo; dy <= hi; dy++) {
      for (let dz = lo; dz <= hi; dz++) {
        const x = px + dx;
        const y = py + dy;
        const z = pz + dz;
        const key = `${x},${y},${z}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push([x, y, z]);
        }
      }
    }
  }
}

/** Like thickenPath but radius interpolates from baseRadius (start) to tipRadius (end) in discrete 1-voxel diameter steps. */
export function thickenPathTapered(
  positions: [number, number, number][],
  baseRadius: number,
  tipRadius: number
): [number, number, number][] {
  if (positions.length === 0) return [];
  if (baseRadius <= 0 && tipRadius <= 0) return positions;
  const seen = new Set<string>();
  const result: [number, number, number][] = [];
  const n = positions.length;
  for (let idx = 0; idx < n; idx++) {
    const t = n === 1 ? 0 : idx / (n - 1);
    const c = baseRadius + t * (tipRadius - baseRadius);
    const size = taperRadiusToSize(Math.max(0, c));
    const [px, py, pz] = positions[idx];
    addThickenPoint(px, py, pz, size, seen, result);
  }
  return result;
}

const BRANCH_R2_EPS = 1e-8;

function normalize3(v: [number, number, number]): [number, number, number] | null {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-9) return null;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function branchTangentAt(
  positions: [number, number, number][],
  i: number
): [number, number, number] | null {
  const n = positions.length;
  if (n === 1) return [0, 0, 1];
  if (i === 0) {
    return normalize3([
      positions[1][0] - positions[0][0],
      positions[1][1] - positions[0][1],
      positions[1][2] - positions[0][2]
    ]);
  }
  if (i === n - 1) {
    return normalize3([
      positions[n - 1][0] - positions[n - 2][0],
      positions[n - 1][1] - positions[n - 2][1],
      positions[n - 1][2] - positions[n - 2][2]
    ]);
  }
  return normalize3([
    positions[i + 1][0] - positions[i - 1][0],
    positions[i + 1][1] - positions[i - 1][1],
    positions[i + 1][2] - positions[i - 1][2]
  ]);
}

function mergeVoxelIntoSeen(
  x: number,
  y: number,
  z: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  const k = `${x},${y},${z}`;
  if (!seen.has(k)) {
    seen.add(k);
    result.push([x, y, z]);
  }
}

/** Right circular cylinder (flat caps): axial coordinate in [0, L], perpendicular distance ≤ r. */
function addFlatCylinderSegmentVoxels(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const L = Math.hypot(abx, aby, abz);
  if (L < 1e-9) return;
  const tx = abx / L;
  const ty = aby / L;
  const tz = abz / L;
  const r2 = r * r + BRANCH_R2_EPS;
  const pad = Math.ceil(r) + 2;
  const minX = Math.min(ax, bx) - pad;
  const maxX = Math.max(ax, bx) + pad;
  const minY = Math.min(ay, by) - pad;
  const maxY = Math.max(ay, by) + pad;
  const minZ = Math.min(az, bz) - pad;
  const maxZ = Math.max(az, bz) + pad;
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const qax = x - ax;
        const qay = y - ay;
        const qaz = z - az;
        const axial = qax * tx + qay * ty + qaz * tz;
        if (axial < 0 || axial > L) continue;
        const wx = qax - tx * axial;
        const wy = qay - ty * axial;
        const wz = qaz - tz * axial;
        const perp2 = wx * wx + wy * wy + wz * wz;
        if (perp2 <= r2) mergeVoxelIntoSeen(x, y, z, seen, result);
      }
    }
  }
}

/** Capsule around segment (spherical caps at endpoints). */
function addCapsuleSegmentVoxels(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  if (ab2 < 1e-18) return;
  const r2 = r * r + BRANCH_R2_EPS;
  const pad = Math.ceil(r) + 2;
  const minX = Math.min(ax, bx) - pad;
  const maxX = Math.max(ax, bx) + pad;
  const minY = Math.min(ay, by) - pad;
  const maxY = Math.max(ay, by) + pad;
  const minZ = Math.min(az, bz) - pad;
  const maxZ = Math.max(az, bz) + pad;
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const qax = x - ax;
        const qay = y - ay;
        const qaz = z - az;
        let t = (qax * abx + qay * aby + qaz * abz) / ab2;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const px = ax + t * abx;
        const py = ay + t * aby;
        const pz = az + t * abz;
        const dx = x - px;
        const dy = y - py;
        const dz = z - pz;
        if (dx * dx + dy * dy + dz * dz <= r2) mergeVoxelIntoSeen(x, y, z, seen, result);
      }
    }
  }
}

/** Slab disk: perpendicular distance ≤ r and |axial along t| ≤ 0.5 (voxel layer). */
function addDiskSlabVoxels(
  cx: number,
  cy: number,
  cz: number,
  t: [number, number, number],
  r: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  if (r <= 0) {
    mergeVoxelIntoSeen(cx, cy, cz, seen, result);
    return;
  }
  const [tx, ty, tz] = t;
  const r2 = r * r + BRANCH_R2_EPS;
  const pad = Math.ceil(r) + 2;
  for (let x = cx - pad; x <= cx + pad; x++) {
    for (let y = cy - pad; y <= cy + pad; y++) {
      for (let z = cz - pad; z <= cz + pad; z++) {
        const wx = x - cx;
        const wy = y - cy;
        const wz = z - cz;
        const axial = wx * tx + wy * ty + wz * tz;
        if (Math.abs(axial) > 0.5001) continue;
        const perpX = wx - tx * axial;
        const perpY = wy - ty * axial;
        const perpZ = wz - tz * axial;
        const perp2 = perpX * perpX + perpY * perpY + perpZ * perpZ;
        if (perp2 <= r2) mergeVoxelIntoSeen(x, y, z, seen, result);
      }
    }
  }
}

function addSphereCapVoxels(
  cx: number,
  cy: number,
  cz: number,
  r: number,
  t: [number, number, number],
  outwardDotPositive: boolean,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  if (r <= 0) return;
  const [tx, ty, tz] = t;
  const r2 = r * r + BRANCH_R2_EPS;
  const pad = Math.ceil(r) + 2;
  for (let x = cx - pad; x <= cx + pad; x++) {
    for (let y = cy - pad; y <= cy + pad; y++) {
      for (let z = cz - pad; z <= cz + pad; z++) {
        const vx = x - cx;
        const vy = y - cy;
        const vz = z - cz;
        const d2 = vx * vx + vy * vy + vz * vz;
        if (d2 > r2) continue;
        const dot = vx * tx + vy * ty + vz * tz;
        if (outwardDotPositive) {
          if (dot < -BRANCH_R2_EPS) continue;
        } else {
          if (dot > BRANCH_R2_EPS) continue;
        }
        mergeVoxelIntoSeen(x, y, z, seen, result);
      }
    }
  }
}

function addPointedConeCapVoxels(
  origin: [number, number, number],
  dirWorld: { x: number; y: number; z: number },
  baseRadius: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  if (baseRadius <= 0) return;
  const t =
    normalize3([dirWorld.x, dirWorld.y, dirWorld.z]) ?? ([0, 1, 0] as [number, number, number]);
  const K = Math.max(1, Math.ceil(baseRadius));
  const layers = getRayDirectionPath(origin, dirWorld, K);
  for (let k = 1; k < layers.length; k++) {
    const rk = baseRadius * (1 - k / (K + 1));
    if (rk <= 0) continue;
    const c = layers[k];
    addDiskSlabVoxels(c[0], c[1], c[2], t, rk, seen, result);
  }
}

/** Uniform-radius branch cylinder (or capsule); optional pointed cones past flat body ends. */
export function thickenBranchUniformCylinder(
  positions: [number, number, number][],
  r: number,
  cap: BranchEndCap
): [number, number, number][] {
  if (positions.length === 0) return [];
  if (r <= 0) return [...positions];
  const seen = new Set<string>();
  const result: [number, number, number][] = [];
  const n = positions.length;

  if (n === 1) {
    const p = positions[0];
    expandPathWithBrushStamps([p], 'sphere', r, 0).forEach(([x, y, z]) =>
      mergeVoxelIntoSeen(x, y, z, seen, result)
    );
    if (cap === 'pointed') {
      addPointedConeCapVoxels(p, { x: 0, y: 1, z: 0 }, r, seen, result);
      addPointedConeCapVoxels(p, { x: 0, y: -1, z: 0 }, r, seen, result);
    }
    return result;
  }

  const useCapsule = cap === 'rounded';
  for (let i = 0; i < n - 1; i++) {
    const a = positions[i];
    const b = positions[i + 1];
    if (useCapsule) {
      addCapsuleSegmentVoxels(a[0], a[1], a[2], b[0], b[1], b[2], r, seen, result);
    } else {
      addFlatCylinderSegmentVoxels(a[0], a[1], a[2], b[0], b[1], b[2], r, seen, result);
    }
  }

  if (cap === 'pointed') {
    const t0 = branchTangentAt(positions, 0);
    if (t0) {
      addPointedConeCapVoxels(
        positions[0],
        { x: -t0[0], y: -t0[1], z: -t0[2] },
        r,
        seen,
        result
      );
    }
    const t1 = branchTangentAt(positions, n - 1);
    if (t1) {
      addPointedConeCapVoxels(positions[n - 1], { x: t1[0], y: t1[1], z: t1[2] }, r, seen, result);
    }
  }

  return result;
}

/** Tapered branch cylinder: disk slab per sample; same radius interpolation as thickenPathTapered. */
export function thickenBranchTaperedCylinder(
  positions: [number, number, number][],
  baseRadius: number,
  tipRadius: number,
  cap: BranchEndCap
): [number, number, number][] {
  if (positions.length === 0) return [];
  if (baseRadius <= 0 && tipRadius <= 0) return [...positions];
  const seen = new Set<string>();
  const result: [number, number, number][] = [];
  const n = positions.length;

  const radii: number[] = [];
  for (let idx = 0; idx < n; idx++) {
    const t = n === 1 ? 0 : idx / (n - 1);
    const c = baseRadius + t * (tipRadius - baseRadius);
    radii.push(taperRadiusToSize(Math.max(0, c)));
  }

  if (n === 1) {
    const r0 = radii[0];
    if (r0 <= 0) return [positions[0]];
    return thickenBranchUniformCylinder(positions, r0, cap);
  }

  for (let i = 0; i < n; i++) {
    const ri = radii[i];
    const p = positions[i];
    if (ri <= 0) {
      mergeVoxelIntoSeen(p[0], p[1], p[2], seen, result);
      continue;
    }
    const ti = branchTangentAt(positions, i);
    if (!ti) continue;
    addDiskSlabVoxels(p[0], p[1], p[2], ti, ri, seen, result);
  }

  if (cap === 'rounded') {
    const r0 = radii[0];
    const t0 = branchTangentAt(positions, 0);
    if (t0 && r0 > 0) {
      addSphereCapVoxels(positions[0][0], positions[0][1], positions[0][2], r0, t0, false, seen, result);
    }
    const r1 = radii[n - 1];
    const t1 = branchTangentAt(positions, n - 1);
    if (t1 && r1 > 0) {
      addSphereCapVoxels(
        positions[n - 1][0],
        positions[n - 1][1],
        positions[n - 1][2],
        r1,
        t1,
        true,
        seen,
        result
      );
    }
  }

  if (cap === 'pointed') {
    const r0 = radii[0];
    const t0 = branchTangentAt(positions, 0);
    if (t0 && r0 > 0) {
      addPointedConeCapVoxels(
        positions[0],
        { x: -t0[0], y: -t0[1], z: -t0[2] },
        r0,
        seen,
        result
      );
    }
    const r1 = radii[n - 1];
    const t1 = branchTangentAt(positions, n - 1);
    if (t1 && r1 > 0) {
      addPointedConeCapVoxels(positions[n - 1], { x: t1[0], y: t1[1], z: t1[2] }, r1, seen, result);
    }
  }

  return result;
}

/** Expands each path point into a cube of radius r (Chebyshev). Radius 0 = single voxel. */
export function thickenPath(
  positions: [number, number, number][],
  radius: number
): [number, number, number][] {
  if (radius <= 0) return positions;
  const lo = -Math.ceil(radius);
  const hi = Math.floor(radius);
  const seen = new Set<string>();
  const result: [number, number, number][] = [];
  for (const [px, py, pz] of positions) {
    for (let dx = lo; dx <= hi; dx++) {
      for (let dy = lo; dy <= hi; dy++) {
        for (let dz = lo; dz <= hi; dz++) {
          const x = px + dx;
          const y = py + dy;
          const z = pz + dz;
          const k = `${x},${y},${z}`;
          if (!seen.has(k)) {
            seen.add(k);
            result.push([x, y, z]);
          }
        }
      }
    }
  }
  return result;
}

/** Layer plane is perpendicular to this world axis (voxels share constant x, y, or z along the stroke). */
function faceNormalToLayerAxis(normal: { x: number; y: number; z: number } | undefined): 0 | 1 | 2 {
  if (!normal) return 1;
  const [nx, ny] = snapNormalToAxis(normal);
  if (nx !== 0) return 0;
  if (ny !== 0) return 1;
  return 2;
}

/** Euclidean disk in the plane perpendicular to normalAxis (single voxel thick). */
function diskPathInPlane(
  positions: [number, number, number][],
  radius: number,
  normalAxis: 0 | 1 | 2
): [number, number, number][] {
  if (radius <= 0) return positions;
  const lo = -Math.ceil(radius);
  const hi = Math.floor(radius);
  const rSq = radius * radius;
  const seen = new Set<string>();
  const result: [number, number, number][] = [];
  for (const [px, py, pz] of positions) {
    for (let dx = lo; dx <= hi; dx++) {
      for (let dy = lo; dy <= hi; dy++) {
        for (let dz = lo; dz <= hi; dz++) {
          if (normalAxis === 0 && dx !== 0) continue;
          if (normalAxis === 1 && dy !== 0) continue;
          if (normalAxis === 2 && dz !== 0) continue;
          if (dx * dx + dy * dy + dz * dz > rSq) continue;
          const x = px + dx;
          const y = py + dy;
          const z = pz + dz;
          const k = `${x},${y},${z}`;
          if (!seen.has(k)) {
            seen.add(k);
            result.push([x, y, z]);
          }
        }
      }
    }
  }
  return result;
}

/** Thickens path only in the plane perpendicular to the given axis (0=X, 1=Y, 2=Z). Used for wall width so height is unaffected. */
function thickenPathInPlane(
  positions: [number, number, number][],
  radius: number,
  normalAxis: 0 | 1 | 2
): [number, number, number][] {
  if (radius <= 0) return positions;
  const lo = -Math.ceil(radius);
  const hi = Math.floor(radius);
  const seen = new Set<string>(positions.map(([x, y, z]) => `${x},${y},${z}`));
  const result: [number, number, number][] = [...positions];
  for (const [px, py, pz] of positions) {
    if (normalAxis === 0) {
      for (let dy = lo; dy <= hi; dy++) {
        for (let dz = lo; dz <= hi; dz++) {
          const k = `${px},${py + dy},${pz + dz}`;
          if (!seen.has(k)) {
            seen.add(k);
            result.push([px, py + dy, pz + dz]);
          }
        }
      }
    } else if (normalAxis === 1) {
      for (let dx = lo; dx <= hi; dx++) {
        for (let dz = lo; dz <= hi; dz++) {
          const k = `${px + dx},${py},${pz + dz}`;
          if (!seen.has(k)) {
            seen.add(k);
            result.push([px + dx, py, pz + dz]);
          }
        }
      }
    } else {
      for (let dx = lo; dx <= hi; dx++) {
        for (let dy = lo; dy <= hi; dy++) {
          const k = `${px + dx},${py + dy},${pz}`;
          if (!seen.has(k)) {
            seen.add(k);
            result.push([px + dx, py + dy, pz]);
          }
        }
      }
    }
  }
  return result;
}

/** Sphere: x²+y²+z² <= r² (Euclidean). Same voxels as legacy getSphereVoxels + per-voxel Math.round (see expandPathWithBrushStamps). */
function addSphereVoxelsToSeen(
  cx: number,
  cy: number,
  cz: number,
  r: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  if (r <= 0) {
    const xi = Math.round(cx);
    const yi = Math.round(cy);
    const zi = Math.round(cz);
    const k = `${xi},${yi},${zi}`;
    if (!seen.has(k)) {
      seen.add(k);
      result.push([xi, yi, zi]);
    }
    return;
  }
  const lo = -Math.ceil(r);
  const hi = Math.floor(r);
  const rSq = r * r;
  for (let dx = lo; dx <= hi; dx++) {
    for (let dy = lo; dy <= hi; dy++) {
      for (let dz = lo; dz <= hi; dz++) {
        if (dx * dx + dy * dy + dz * dz <= rSq) {
          const xi = Math.round(cx + dx);
          const yi = Math.round(cy + dy);
          const zi = Math.round(cz + dz);
          const k = `${xi},${yi},${zi}`;
          if (!seen.has(k)) {
            seen.add(k);
            result.push([xi, yi, zi]);
          }
        }
      }
    }
  }
}

/**
 * One spherical brush stamp merged into accumulators (deterministic: no scatter / radius-range RNG).
 * Matches a single iteration of `expandPathWithBrushStamps` with shape `sphere` for that center and radius.
 */
export function mergeSphereStampIntoSeen(
  cx: number,
  cy: number,
  cz: number,
  radius: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  addSphereVoxelsToSeen(cx, cy, cz, radius, seen, result);
}

/** One cuboid brush stamp (same as thickenPath on a single center). */
export function mergeCubeStampIntoSeen(
  px: number,
  py: number,
  pz: number,
  radius: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  if (radius <= 0) {
    const x = Math.round(px);
    const y = Math.round(py);
    const z = Math.round(pz);
    const k = `${x},${y},${z}`;
    if (!seen.has(k)) {
      seen.add(k);
      result.push([x, y, z]);
    }
    return;
  }
  const lo = -Math.ceil(radius);
  const hi = Math.floor(radius);
  for (let dx = lo; dx <= hi; dx++) {
    for (let dy = lo; dy <= hi; dy++) {
      for (let dz = lo; dz <= hi; dz++) {
        const x = px + dx;
        const y = py + dy;
        const z = pz + dz;
        const key = `${x},${y},${z}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push([x, y, z]);
        }
      }
    }
  }
}

/** One pyramid brush stamp (same footprint as draw `pyramidPath` per center). */
export function mergePyramidStampIntoSeen(
  px: number,
  py: number,
  pz: number,
  radius: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  for (const [x, y, z] of getPyramidVoxels(px, py, pz, radius)) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    const zi = Math.round(z);
    const k = `${xi},${yi},${zi}`;
    if (!seen.has(k)) {
      seen.add(k);
      result.push([xi, yi, zi]);
    }
  }
}

/** Returns a deterministic RNG in [0, 1) from a seed (mulberry32). */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0; // 32-bit
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Offset spray droplet center along face normal so the stamp sits on the surface (same idea as draw brush snap). */
export function offsetSprayStampCenterForSnap(
  px: number,
  py: number,
  pz: number,
  stampRadius: number,
  normal: { x: number; y: number; z: number } | undefined | null
): [number, number, number] {
  if (!normal) return [px, py, pz];
  const k = Math.max(0, Math.round(stampRadius));
  return [px + normal.x * k, py + normal.y * k, pz + normal.z * k];
}

/**
 * Union of brush stamps (`sphere` | `cube` | `pyramid`) at each path point.
 * Radius 0=single voxel; sphere r=1 gives 7 voxels (center + 6 face neighbors); cube uses Chebyshev neighborhood per center.
 * Scatter: max voxel offset for stamp centers (0=none). When radiusMin/radiusMax provided and radiusMax > radiusMin, picks random radius per stamp.
 * Optional rng for deterministic scatter/radius (e.g. from createSeededRng).
 * When snapSurfaceNormal is set, each stamp center is offset by round(stampRadius) * normal before scatter (surface embed).
 */
export function expandPathWithBrushStamps(
  positions: [number, number, number][],
  brushShape: DrawBrushShape,
  radius: number,
  scatter: number = 0,
  radiusMin?: number,
  radiusMax?: number,
  rng?: () => number,
  snapSurfaceNormal?: { x: number; y: number; z: number } | null
): [number, number, number][] {
  if (positions.length === 0) return [];
  const rand = rng ?? Math.random;
  const useRange = radiusMin !== undefined && radiusMax !== undefined && radiusMax > radiusMin;
  const rMin = useRange ? Math.max(0, radiusMin!) : Math.max(0, radius);
  const rMax = useRange ? Math.max(0, radiusMax!) : rMin;
  const s = Math.max(0, Math.floor(scatter));
  const seen = new Set<string>();
  const result: [number, number, number][] = [];
  for (const [px, py, pz] of positions) {
    const ox = s > 0 ? Math.round((rand() * 2 - 1) * s) : 0;
    const oy = s > 0 ? Math.round((rand() * 2 - 1) * s) : 0;
    const oz = s > 0 ? Math.round((rand() * 2 - 1) * s) : 0;
    const r = useRange
      ? (Math.round(rMin * 2) +
          Math.floor(rand() * (Math.round(rMax * 2) - Math.round(rMin * 2) + 1))) /
        2
      : rMin;
    const [bx, by, bz] = offsetSprayStampCenterForSnap(px, py, pz, r, snapSurfaceNormal);
    if (brushShape === 'sphere') {
      addSphereVoxelsToSeen(bx + ox, by + oy, bz + oz, r, seen, result);
    } else {
      const xi = Math.round(bx + ox);
      const yi = Math.round(by + oy);
      const zi = Math.round(bz + oz);
      if (brushShape === 'cube') {
        mergeCubeStampIntoSeen(xi, yi, zi, r, seen, result);
      } else {
        mergePyramidStampIntoSeen(xi, yi, zi, r, seen, result);
      }
    }
  }
  return result;
}

/** World-axis direction for wall/spray. 'auto' = use face normal (wall only). */
export type SprayDirectionName =
  | 'none'
  | 'auto'
  | 'down'
  | 'up'
  | 'forward'
  | 'back'
  | 'left'
  | 'right';

/** Snap face normal to nearest principal axis (max |component|). */
export function snapNormalToAxis(n: { x: number; y: number; z: number }): [number, number, number] {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  if (ax >= ay && ax >= az) return [n.x >= 0 ? 1 : -1, 0, 0];
  if (ay >= az) return [0, n.y >= 0 ? 1 : -1, 0];
  return [0, 0, n.z >= 0 ? 1 : -1];
}

/** Returns [dx, dy, dz] for the given direction. When dir is 'auto', pass faceNormal to use it. */
export function getSprayDirectionVector(
  dir: SprayDirectionName,
  faceNormal?: { x: number; y: number; z: number } | null
): [number, number, number] | null {
  if (dir === 'auto' && faceNormal) return snapNormalToAxis(faceNormal);
  switch (dir) {
    case 'none':
    case 'auto':
      return null;
    case 'down':
      return [0, -1, 0];
    case 'up':
      return [0, 1, 0];
    case 'forward':
      return [0, 0, -1];
    case 'back':
      return [0, 0, 1];
    case 'left':
      return [-1, 0, 0];
    case 'right':
      return [1, 0, 0];
    default:
      return null;
  }
}

/** One voxel step perpendicular to direction (for 2-voxel wall width). */
function perpendicularStep(dir: [number, number, number]): [number, number, number] {
  const [dx, dy] = dir;
  if (dx !== 0) return [0, 1, 0];
  if (dy !== 0) return [1, 0, 0];
  return [0, 1, 0];
}

/** From each path point, add voxels at point + k*direction for k = 1..streakLength. Dedupes via seen set. */
function directionalStreakFromPath(
  positions: [number, number, number][],
  direction: [number, number, number],
  streakLength: number,
  seen: Set<string>,
  result: [number, number, number][]
): void {
  const len = Math.max(0, Math.floor(streakLength));
  if (len === 0) return;
  const [dx, dy, dz] = direction;
  for (const [px, py, pz] of positions) {
    const xi = Math.round(px);
    const yi = Math.round(py);
    const zi = Math.round(pz);
    for (let k = 1; k <= len; k++) {
      const x = xi + k * dx;
      const y = yi + k * dy;
      const z = zi + k * dz;
      const key = `${x},${y},${z}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push([x, y, z]);
      }
    }
  }
}

/** Params for path thickening; used by both preview and apply to avoid divergence. */
export interface PathThickenParams {
  strokeMode: StrokeMode;
  sculptMode?: SculptMode;
  sculptBrushRadius: number;
  branchTaper: boolean;
  /** When branch+taper: start radius (optional; falls back to sculptBrushRadius). */
  branchTaperStartRadius?: number;
  /** When branch+taper: end radius (optional; falls back to 0). */
  branchTaperEndRadius?: number;
  sprayRadius: number;
  sprayScatter: number;
  sprayRadiusRange: boolean;
  sprayRadiusMin: number;
  sprayRadiusMax: number;
  /** Spray stamp footprint: sphere, cube, or pyramid (same as draw brush shapes). */
  sprayBrushShape?: DrawBrushShape;
  /** When true and drawBrushFaceNormal set, offset each droplet along that normal (surface embed). */
  spraySnapToSurface?: boolean;
  /** When true, Spray voxels are restricted to the plane through the path start. */
  sprayConstrainToPlane?: boolean;
  /** Axis for plane constraint when sprayConstrainToPlane: from face normal (sprayPlaneAxis) or sidebar (planeAxis). Ignored when sprayPlaneNormal set. */
  sprayPlaneAxis?: 0 | 1 | 2;
  /** Plane normal for camera-plane constraint (non-axis-aligned). When set, voxels are filtered to lie on this plane through the path start. */
  sprayPlaneNormal?: { x: number; y: number; z: number };
  /** Axis for plane constraint (0=X, 1=Y, 2=Z, 'auto'=Y). Used when sprayPlaneAxis not set. */
  planeAxis?: 0 | 1 | 2 | 'auto';
  /** Wall/spray direction. 'auto' uses wallFaceNormal when present. */
  sprayDirection?: SprayDirectionName;
  sprayStreakLength?: number;
  /** Wall: path thickness (0=1 voxel, 1=2 voxels, 2=3 voxels, 3=4 voxels, 4=5 voxels). */
  wallWidth?: number;
  /** Wall: extension along direction (min 2). */
  wallHeight?: number;
  /** Wall: when direction is 'auto', use this face normal. */
  wallFaceNormal?: { x: number; y: number; z: number } | null;
  drawBrushShape?: 'sphere' | 'cube' | 'pyramid';
  drawBrushSize?: number;
  /** When true and drawBrushFaceNormal set, offset brush by radius*normal so it sits on surface */
  drawBrushSnapToSurface?: boolean;
  drawBrushFaceNormal?: { x: number; y: number; z: number };
  /** Draw / smooth / gouge: square|circle = tangent plane; cube|sphere = 3D along stroke. */
  sculptBrushShape?: SculptBrushShape;
  /** Sculpt branch: axis-aligned cube vs cylinder along the stroke polyline. */
  branchBrushProfile?: BranchBrushProfile;
  /** Sculpt branch cylinder: flat ends, capsule-style rounded ends, or conical tips. */
  branchEndCap?: BranchEndCap;
  /** Optional seed for deterministic scatter/radius in expandPathWithBrushStamps (preview and apply use same seed per stroke). */
  seed?: number;
}

/**
 * Thickens a path according to stroke/sculpt mode. Single source of truth for preview and apply.
 * Priority: Spray stroke > sculpt branch+taper > sculpt thicken > raw.
 */
export function thickenPathForStroke(
  positions: [number, number, number][],
  params: PathThickenParams
): [number, number, number][] {
  if (positions.length === 0) return [];
  const isSculptPath =
    params.sculptMode !== undefined && SCULPT_PATH_THICKEN_MODES.has(params.sculptMode);
  const rng = params.seed != null ? createSeededRng(params.seed) : undefined;

  // Sculpt modes take precedence; stroke mode (e.g. Spray) only applies to Draw tools
  if (isSculptPath && params.sculptMode === 'wall') {
    const dir = params.sprayDirection ?? 'auto';
    const dirVec = getSprayDirectionVector(dir, params.wallFaceNormal ?? undefined);
    if (!dirVec) return positions;
    const width = Math.max(0, Math.floor(params.wallWidth ?? 0));
    let basePositions: [number, number, number][];
    if (width === 0) {
      basePositions = positions;
    } else if (width === 1) {
      // 2 voxels thick: path + one step perpendicular to direction
      const perp = perpendicularStep(dirVec);
      const seen = new Set<string>(positions.map(([x, y, z]) => `${x},${y},${z}`));
      basePositions = [...positions];
      for (const [px, py, pz] of positions) {
        const x = px + perp[0];
        const y = py + perp[1];
        const z = pz + perp[2];
        const key = `${x},${y},${z}`;
        if (!seen.has(key)) {
          seen.add(key);
          basePositions.push([x, y, z]);
        }
      }
    } else {
      // Thicken only in the plane perpendicular to wall direction so width does not affect height
      const dirAxis = (dirVec[0] !== 0 ? 0 : dirVec[1] !== 0 ? 1 : 2) as 0 | 1 | 2;
      basePositions = thickenPathInPlane(positions, (width - 1) * 0.5, dirAxis);
    }
    const height = Math.max(2, Math.floor(params.wallHeight ?? params.sprayStreakLength ?? 2));
    const seen = new Set<string>(basePositions.map(([x, y, z]) => `${x},${y},${z}`));
    const result: [number, number, number][] = [...basePositions];
    directionalStreakFromPath(basePositions, dirVec, height, seen, result);
    return result;
  }
  if (isSculptPath && params.sculptMode === 'branch') {
    const profile = params.branchBrushProfile ?? 'cube';
    const cap = params.branchEndCap ?? 'flat';
    const r = params.sculptBrushRadius;
    if (params.branchTaper) {
      const startR = params.branchTaperStartRadius ?? r;
      const endR = params.branchTaperEndRadius ?? 0;
      if (profile === 'cube') {
        return thickenPathTapered(positions, startR, endR);
      }
      return thickenBranchTaperedCylinder(positions, startR, endR, cap);
    }
    if (r <= 0) return positions;
    if (profile === 'cube') {
      return thickenPath(positions, r);
    }
    return thickenBranchUniformCylinder(positions, r, cap);
  }
  // Terrain: columns are (x,z) only; expand brush in the horizontal plane (world Y up).
  if (isSculptPath && params.sculptMode === 'terrain' && params.sculptBrushRadius > 0) {
    const shape = params.sculptBrushShape ?? 'square';
    const r = params.sculptBrushRadius;
    if (shape === 'circle' || shape === 'sphere') {
      return diskPathInPlane(positions, r, 1);
    }
    return thickenPathInPlane(positions, r, 1);
  }
  // Draw, smooth, gouge: four brush shapes (2D in tangent plane vs 3D volumetric).
  if (
    isSculptPath &&
    (params.sculptMode === 'draw' ||
      params.sculptMode === 'smooth' ||
      params.sculptMode === 'gouge') &&
    params.sculptBrushRadius > 0
  ) {
    const shape = params.sculptBrushShape ?? 'square';
    const r = params.sculptBrushRadius;
    const axis = faceNormalToLayerAxis(params.drawBrushFaceNormal);
    switch (shape) {
      case 'square':
        return thickenPathInPlane(positions, r, axis);
      case 'circle':
        return diskPathInPlane(positions, r, axis);
      case 'cube':
        return thickenPath(positions, r);
      case 'sphere':
        return expandPathWithBrushStamps(positions, 'sphere', r, 0);
    }
  }
  if (isSculptPath && params.sculptBrushRadius > 0) {
    return thickenPath(positions, params.sculptBrushRadius);
  }
  if (isSculptPath) return positions;
  if (params.strokeMode === 'spray') {
    const shape = params.sprayBrushShape ?? 'sphere';
    const rMin = params.sprayRadiusRange ? params.sprayRadiusMin : undefined;
    const rMax = params.sprayRadiusRange ? params.sprayRadiusMax : undefined;
    const snapN =
      (params.spraySnapToSurface ?? false) && params.drawBrushFaceNormal
        ? params.drawBrushFaceNormal
        : null;
    return expandPathWithBrushStamps(
      positions,
      shape,
      params.sprayRadius,
      params.sprayScatter,
      rMin,
      rMax,
      rng,
      snapN
    );
  }
  const dbs = params.drawBrushSize ?? 0;
  if (dbs > 0) {
    const shape = params.drawBrushShape ?? 'sphere';
    const snap = params.drawBrushSnapToSurface ?? false;
    const n = snap ? params.drawBrushFaceNormal : undefined;
    const r = Math.round(dbs);
    const positionsToUse =
      n && r > 0
        ? positions.map(
            ([px, py, pz]) => [px + n.x * r, py + n.y * r, pz + n.z * r] as [number, number, number]
          )
        : positions;
    if (shape === 'pyramid') return pyramidPath(positionsToUse, dbs);
    if (shape === 'cube') return thickenPath(positionsToUse, dbs);
    return expandPathWithBrushStamps(positionsToUse, 'sphere', dbs, 0);
  }
  return positions;
}

/** Pyramid: base scales with radius at bottom and tapers to 1x1 at top. */
function getPyramidVoxels(
  cx: number,
  cy: number,
  cz: number,
  r: number
): [number, number, number][] {
  if (r <= 0) return [[Math.round(cx), Math.round(cy), Math.round(cz)]];
  const lo = -Math.ceil(r);
  const hi = Math.floor(r);
  const span = Math.max(1, hi - lo);
  const positions: [number, number, number][] = [];
  for (let dy = lo; dy <= hi; dy++) {
    const t = (dy - lo) / span;
    const layerR = Math.max(0, r * (1 - t));
    const layerLo = -Math.ceil(layerR);
    const layerHi = Math.floor(layerR);
    for (let dx = layerLo; dx <= layerHi; dx++) {
      for (let dz = layerLo; dz <= layerHi; dz++) {
        positions.push([cx + dx, cy + dy, cz + dz]);
      }
    }
  }
  return positions;
}

/** Expands each path point into a pyramid brush. */
export function pyramidPath(
  positions: [number, number, number][],
  radius: number
): [number, number, number][] {
  if (positions.length === 0) return [];
  if (radius <= 0) return positions;
  const seen = new Set<string>();
  const result: [number, number, number][] = [];
  for (const [px, py, pz] of positions) {
    for (const [x, y, z] of getPyramidVoxels(px, py, pz, radius)) {
      const k = `${x},${y},${z}`;
      if (!seen.has(k)) {
        seen.add(k);
        result.push([x, y, z]);
      }
    }
  }
  return result;
}

/** Applies a brush along a path. Sphere uses expandPathWithBrushStamps (scatter=0); cube uses thickenPath. */
export function applyBrushAlongPath(
  positions: [number, number, number][],
  shape: 'sphere' | 'cube',
  radius: number
): [number, number, number][] {
  if (positions.length === 0) return [];
  if (shape === 'sphere') {
    return expandPathWithBrushStamps(positions, 'sphere', radius, 0);
  }
  return thickenPath(positions, radius);
}

/** Gravity direction for rope catenary: rope sags toward this axis. */
export type RopeGravityDirection = 'down' | 'up' | 'left' | 'right' | 'forward' | 'back';

function ropeGravityVector(dir: RopeGravityDirection): [number, number, number] {
  switch (dir) {
    case 'down':
      return [0, -1, 0];
    case 'up':
      return [0, 1, 0];
    case 'left':
      return [-1, 0, 0];
    case 'right':
      return [1, 0, 0];
    case 'forward':
      return [0, 0, -1];
    case 'back':
      return [0, 0, 1];
  }
}

/** Catenary through two 3D points. tension 0=max sag, 1=taut (nearly straight). Returns centerline voxels. */
export function getRopeCurveVoxels(
  a: [number, number, number],
  b: [number, number, number],
  tension: number,
  gravityDirection: RopeGravityDirection = 'down'
): [number, number, number][] {
  const g = ropeGravityVector(gravityDirection);
  const gPerp: [number, number, number] = [-g[0], -g[1], -g[2]];
  const dot = (p: [number, number, number], q: [number, number, number]) =>
    p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const ba: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.sqrt(ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2]);
  if (L < 1e-9) return [a];

  const t0 = Math.max(0, Math.min(1, tension));
  const aMin = L * 0.3;
  const aMax = L * 50;
  const catA = aMin * Math.pow(aMax / aMin, t0);

  const baAlongPerp = dot(ba, gPerp);
  const u: [number, number, number] = [
    ba[0] - baAlongPerp * gPerp[0],
    ba[1] - baAlongPerp * gPerp[1],
    ba[2] - baAlongPerp * gPerp[2]
  ];
  const Lh = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);

  if (Lh < 1e-6 * L) {
    return getBresenham3DLine(a, b);
  }

  const v: [number, number, number] = [u[0] / Lh, u[1] / Lh, u[2] / Lh];
  const s1 = dot(a, gPerp);
  const s2 = dot(b, gPerp);

  function catenaryY(x: number, x0: number, c: number): number {
    return catA * Math.cosh((x - x0) / catA) + c;
  }

  function f(x0: number): number {
    return catA * (Math.cosh((Lh - x0) / catA) - Math.cosh(-x0 / catA)) - (s2 - s1);
  }

  let x0 = Lh / 2;
  for (let i = 0; i < 30; i++) {
    const fx = f(x0);
    if (Math.abs(fx) < 1e-9) break;
    const eps = 1e-6;
    const df = (f(x0 + eps) - f(x0 - eps)) / (2 * eps);
    if (Math.abs(df) < 1e-12) break;
    x0 = x0 - fx / df;
    x0 = Math.max(-Lh * 2, Math.min(Lh * 2, x0));
  }
  if (Math.abs(f(x0)) > 1e-6) {
    return getBresenham3DLine(a, b);
  }

  const c = s1 - catA * Math.cosh(-x0 / catA);
  const steps = Math.max(50, Math.ceil(L * 2));
  const points: [number, number, number][] = [];
  const seen = new Set<string>();

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * Lh;
    const sag = catenaryY(x, x0, c);
    const px = a[0] + x * v[0] + (sag - s1) * gPerp[0];
    const py = a[1] + x * v[1] + (sag - s1) * gPerp[1];
    const pz = a[2] + x * v[2] + (sag - s1) * gPerp[2];
    const xi = Math.round(px);
    const yi = Math.round(py);
    const zi = Math.round(pz);
    const k = `${xi},${yi},${zi}`;
    if (!seen.has(k)) {
      seen.add(k);
      points.push([xi, yi, zi]);
    }
  }

  const result: [number, number, number][] = [];
  const resultSeen = new Set<string>();
  for (let i = 0; i < points.length - 1; i++) {
    const seg = getBresenham3DLine(points[i], points[i + 1]);
    for (const p of seg) {
      const k = `${p[0]},${p[1]},${p[2]}`;
      if (!resultSeen.has(k)) {
        resultSeen.add(k);
        result.push(p);
      }
    }
  }
  if (points.length === 1) result.push(points[0]);

  const eq = (p: [number, number, number], q: [number, number, number]) =>
    p[0] === q[0] && p[1] === q[1] && p[2] === q[2];
  if (result.length > 0) {
    if (!eq(result[0], a)) {
      const seg = getBresenham3DLine(a, result[0]).slice(0, -1).reverse();
      result.unshift(...seg);
    }
    const last = result[result.length - 1];
    if (!eq(last, b)) {
      const seg = getBresenham3DLine(last, b).slice(1);
      result.push(...seg);
    }
  }
  return result.length > 0 ? result : [a, b];
}

const CLOTH_PATCH_MAX_CELLS = 2200;
const CLOTH_PATCH_MAX_DIM = 46;

function clothPatchPointInPolygon2D(px: number, py: number, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i]!;
    const pj = poly[j]!;
    const yi = pi.y;
    const yj = pj.y;
    if ((yi > py) !== (yj > py)) {
      const xInt = ((pj.x - pi.x) * (py - yi)) / (yj - yi) + pi.x;
      if (px < xInt) inside = !inside;
    }
  }
  return inside;
}

/** Optional tuning for cloth PBD (defaults match prior hard-coded behavior when omitted). */
export type ClothSimOptions = {
  /** Multiplier on gravity step (default 1). */
  gravityScale?: number;
  /** Multiplier on distance-constraint relaxation (default 1). */
  stiffnessScale?: number;
  /** Solver iterations; if omitted, uses `round(28 + 22 * tension)`. */
  iterations?: number;
  /** Constraint projection passes per outer iteration (default 2). */
  constraintPasses?: number;
};

/**
 * Closed polygon of 3+ pin voxels in 3D, filled with a plane grid, relaxed with PBD + gravity.
 * Pins are the polygon boundary (Bresenham edges between consecutive pins, closed).
 * tension 0 = loose/drapy, 1 = stiff. Returns positions for `applyBrushAlongPath`.
 */
export function getClothPatchFromPinsVoxels(
  pins: [number, number, number][],
  tension: number,
  gravityDirection: RopeGravityDirection,
  _brushRadiusVoxels: number,
  simOptions?: ClothSimOptions
): [number, number, number][] {
  const sub = (p: [number, number, number], q: [number, number, number]): [number, number, number] => [
    p[0] - q[0],
    p[1] - q[1],
    p[2] - q[2]
  ];
  const add = (p: [number, number, number], q: [number, number, number]): [number, number, number] => [
    p[0] + q[0],
    p[1] + q[1],
    p[2] + q[2]
  ];
  const scale = (p: [number, number, number], s: number): [number, number, number] => [
    p[0] * s,
    p[1] * s,
    p[2] * s
  ];
  const len = (p: [number, number, number]) =>
    Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
  const norm = (p: [number, number, number]): [number, number, number] => {
    const L = len(p);
    if (L < 1e-12) return [0, 0, 0];
    return [p[0] / L, p[1] / L, p[2] / L];
  };
  const cross = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const dot3 = (a: [number, number, number], b: [number, number, number]) =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const raw = pins.filter((p, i) => i === 0 || p[0] !== pins[i - 1]![0] || p[1] !== pins[i - 1]![1] || p[2] !== pins[i - 1]![2]);
  if (raw.length < 3) return [];

  const O = raw[0]!;
  let e1 = sub(raw[1]!, O);
  let nvec = cross(e1, sub(raw[2]!, O));
  let k = 3;
  while (len(nvec) < 1e-9 && k < raw.length) {
    nvec = cross(e1, sub(raw[k]!, O));
    k++;
  }
  if (len(nvec) < 1e-9) {
    const out: [number, number, number][] = [];
    const seen = new Set<string>();
    const n = raw.length;
    for (let i = 0; i < n; i++) {
      const seg = getBresenham3DLine(raw[i]!, raw[(i + 1) % n]!);
      for (const p of seg) {
        const key = `${p[0]},${p[1]},${p[2]}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(p);
        }
      }
    }
    return out.length > 0 ? out : [];
  }

  const nunit = norm(nvec);
  let uaxis = norm(e1);
  if (Math.abs(dot3(uaxis, nunit)) > 0.99) {
    uaxis = norm(cross(nunit, [1, 0, 0]));
    if (len(uaxis) < 1e-6) uaxis = norm(cross(nunit, [0, 1, 0]));
  }
  const vaxis = norm(cross(nunit, uaxis));

  const uvPoly: { x: number; y: number }[] = [];
  for (const p of raw) {
    const d = sub(p, O);
    uvPoly.push({ x: dot3(d, uaxis), y: dot3(d, vaxis) });
  }
  let area2 = 0;
  for (let i = 0; i < uvPoly.length; i++) {
    const p = uvPoly[i]!;
    const q = uvPoly[(i + 1) % uvPoly.length]!;
    area2 += p.x * q.y - q.x * p.y;
  }
  if (area2 < 0) uvPoly.reverse();

  let umin = uvPoly[0]!.x;
  let umax = uvPoly[0]!.x;
  let vmin = uvPoly[0]!.y;
  let vmax = uvPoly[0]!.y;
  for (const q of uvPoly) {
    umin = Math.min(umin, q.x);
    umax = Math.max(umax, q.x);
    vmin = Math.min(vmin, q.y);
    vmax = Math.max(vmax, q.y);
  }

  const ur = Math.max(1, umax - umin);
  const vr = Math.max(1, vmax - vmin);
  /** Minimum steps so ceil(ur/step)+3 and ceil(vr/step)+3 stay within CLOTH_PATCH_MAX_DIM. */
  const dimSlack = CLOTH_PATCH_MAX_DIM - 3;
  let stepU = Math.max(1, Math.ceil(ur / dimSlack));
  let stepV = Math.max(1, Math.ceil(vr / dimSlack));
  for (let guard = 0; guard < 512; guard++) {
    const nu0 = Math.ceil(ur / stepU) + 3;
    const nv0 = Math.ceil(vr / stepV) + 3;
    if (nu0 * nv0 <= CLOTH_PATCH_MAX_CELLS && Math.max(nu0, nv0) <= CLOTH_PATCH_MAX_DIM) break;
    if (ur / stepU >= vr / stepV) stepU++;
    else stepV++;
  }
  {
    let nu0 = Math.ceil(ur / stepU) + 3;
    let nv0 = Math.ceil(vr / stepV) + 3;
    for (let safety = 0; safety < 10000; safety++) {
      if (nu0 * nv0 <= CLOTH_PATCH_MAX_CELLS && Math.max(nu0, nv0) <= CLOTH_PATCH_MAX_DIM) break;
      if (ur / stepU >= vr / stepV) stepU++;
      else stepV++;
      nu0 = Math.ceil(ur / stepU) + 3;
      nv0 = Math.ceil(vr / stepV) + 3;
    }
  }

  type Node = {
    iu: number;
    iv: number;
    pos: [number, number, number];
    init: [number, number, number];
    /** Unsnapped point on the fitted plane; rest lengths use this so corner snaps don't distort springs. */
    planeInit: [number, number, number];
    pinned: boolean;
  };
  const nodeIndexByKey = new Map<string, number>();
  const nodes: Node[] = [];

  const uStart = Math.floor(umin / stepU) * stepU - stepU;
  const uEnd = Math.ceil(umax / stepU) * stepU + stepU;
  const vStart = Math.floor(vmin / stepV) * stepV - stepV;
  const vEnd = Math.ceil(vmax / stepV) * stepV + stepV;

  /**
   * For each user pin, find the closest grid (iu,iv) that is inside the polygon;
   * only that node gets pinned + snapped to the real 3D click position.
   */
  const pinnedGridKeys = new Map<string, number>();
  for (let j = 0; j < uvPoly.length; j++) {
    const uvp = uvPoly[j]!;
    const baseIU = Math.round(uvp.x / stepU) * stepU;
    const baseIV = Math.round(uvp.y / stepV) * stepV;
    let bestKey: string | null = null;
    let bestD2 = Infinity;
    for (let diu = -stepU; diu <= stepU; diu += stepU) {
      for (let div = -stepV; div <= stepV; div += stepV) {
        const ciu = baseIU + diu;
        const civ = baseIV + div;
        if (!clothPatchPointInPolygon2D(ciu, civ, uvPoly)) continue;
        const du = ciu - uvp.x;
        const dv = civ - uvp.y;
        const d2 = du * du + dv * dv;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestKey = `${ciu},${civ}`;
        }
      }
    }
    if (bestKey !== null) pinnedGridKeys.set(bestKey, j);
  }

  /**
   * Interpolate initial 3D position from pin vertices using inverse-distance weighting in UV.
   * This ensures the starting surface passes through every pin, not just through the plane of pins 0–2.
   */
  function interpolateFromPins(iu: number, iv: number): [number, number, number] {
    let wSum = 0;
    let wx = 0, wy = 0, wz = 0;
    for (let j = 0; j < uvPoly.length; j++) {
      const uvp = uvPoly[j]!;
      const du = iu - uvp.x;
      const dv = iv - uvp.y;
      const d2 = du * du + dv * dv;
      if (d2 < 0.01) return [raw[j]![0], raw[j]![1], raw[j]![2]];
      const w = 1 / d2;
      wSum += w;
      wx += w * raw[j]![0];
      wy += w * raw[j]![1];
      wz += w * raw[j]![2];
    }
    return [wx / wSum, wy / wSum, wz / wSum];
  }

  for (let iu = uStart; iu <= uEnd; iu += stepU) {
    for (let iv = vStart; iv <= vEnd; iv += stepV) {
      if (!clothPatchPointInPolygon2D(iu, iv, uvPoly)) continue;
      const planeInit: [number, number, number] = [
        O[0] + iu * uaxis[0] + iv * vaxis[0],
        O[1] + iu * uaxis[1] + iv * vaxis[1],
        O[2] + iu * uaxis[2] + iv * vaxis[2]
      ];
      const gk = `${iu},${iv}`;
      const pinIdx = pinnedGridKeys.get(gk);
      const pinned = pinIdx !== undefined;
      const pos: [number, number, number] = pinned
        ? [raw[pinIdx]![0], raw[pinIdx]![1], raw[pinIdx]![2]]
        : interpolateFromPins(iu, iv);
      const key = gk;
      const node: Node = {
        iu,
        iv,
        pos: [...pos] as [number, number, number],
        init: [...pos] as [number, number, number],
        planeInit: [...planeInit] as [number, number, number],
        pinned
      };
      const ni = nodes.length;
      nodes.push(node);
      nodeIndexByKey.set(key, ni);
    }
  }

  if (nodes.length === 0) return [];

  type Edge = { a: number; b: number; rest: number };
  const edges: Edge[] = [];
  /** Cardinal springs only (no diagonals). Diagonal shear constraints on a coarse grid fight each other and cause buckling spikes. */
  const neigh: [number, number][] = [
    [stepU, 0],
    [-stepU, 0],
    [0, stepV],
    [0, -stepV]
  ];
  for (let ni = 0; ni < nodes.length; ni++) {
    const a = nodes[ni]!;
    for (const [du, dv] of neigh) {
      const bj = nodeIndexByKey.get(`${a.iu + du},${a.iv + dv}`);
      if (bj === undefined) continue;
      if (bj <= ni) continue;
      const b = nodes[bj]!;
      const rest = len(sub(b.planeInit, a.planeInit));
      if (rest < 1e-9) continue;
      edges.push({ a: ni, b: bj, rest });
    }
  }

  const pos: [number, number, number][] = nodes.map((n) => [...n.pos] as [number, number, number]);
  const pinnedArr = nodes.map((n) => n.pinned);
  const init = nodes.map((n) => [...n.init] as [number, number, number]);

  const t0 = Math.max(0, Math.min(1, tension));
  const opt = simOptions ?? {};
  const gravityScale = Math.max(0, opt.gravityScale ?? 1);
  const stiffnessScale = Math.max(0.05, Math.min(2, opt.stiffnessScale ?? 1));
  const iterations =
    opt.iterations !== undefined
      ? Math.max(4, Math.min(96, Math.round(opt.iterations)))
      : Math.round(28 + 22 * t0);
  const relax = Math.min(0.99, (0.35 + 0.6 * t0) * stiffnessScale);
  const cell = Math.max(stepU, stepV);
  const down = norm(ropeGravityVector(gravityDirection));
  const gravStep = cell * (0.02 + 0.18 * (1 - t0)) * gravityScale;

  const constraintPasses = Math.max(1, Math.min(6, Math.round(opt.constraintPasses ?? 2)));
  for (let it = 0; it < iterations; it++) {
    for (let p = 0; p < pos.length; p++) {
      if (!pinnedArr[p]) pos[p] = add(pos[p], scale(down, gravStep));
    }
    for (let pass = 0; pass < constraintPasses; pass++) {
      for (const { a: ia, b: ib, rest } of edges) {
        if (pinnedArr[ia] && pinnedArr[ib]) continue;
        const pa = pos[ia];
        const pb = pos[ib];
        const d = sub(pb, pa);
        const dist = len(d);
        if (dist < 1e-12) continue;
        const diff = (dist - rest) / dist;
        const correction = scale(d, diff * 0.5 * relax);
        if (!pinnedArr[ia] && !pinnedArr[ib]) {
          pos[ia] = add(pa, correction);
          pos[ib] = sub(pb, correction);
        } else if (pinnedArr[ia]) {
          pos[ib] = sub(pb, scale(correction, 2));
        } else {
          pos[ia] = add(pa, scale(correction, 2));
        }
      }
    }
    for (let p = 0; p < pos.length; p++) {
      if (pinnedArr[p]) pos[p] = [...init[p]!] as [number, number, number];
    }
  }

  /**
   * Rounded node centers + Bresenham bridges along UV neighbors. Cardinal edges span the quad grid;
   * diagonal bridges (path only, not PBD) close **diamond** gaps. Skip chords mostly parallel to
   * gravity to avoid vertical spikes.
   */
  const path: [number, number, number][] = [];
  const pathSeen = new Set<string>();
  const pushPath = (q: [number, number, number]) => {
    const key = `${q[0]},${q[1]},${q[2]}`;
    if (!pathSeen.has(key)) {
      pathSeen.add(key);
      path.push(q);
    }
  };
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i]!;
    pushPath([Math.round(p[0]), Math.round(p[1]), Math.round(p[2])]);
  }
  const gDir = down;
  const maxBridgeCardinal = 36;
  const maxBridgeDiag = 24;
  const maxVerticalAlign = 0.92;

  const bridgeChord = (
    pa: [number, number, number],
    pb: [number, number, number],
    maxCheb: number
  ) => {
    const dx = pb[0] - pa[0];
    const dy = pb[1] - pa[1];
    const dz = pb[2] - pa[2];
    const cheb = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    if (cheb <= 1) return;
    if (cheb > maxCheb) return;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-9) return;
    const align = Math.abs(dx * gDir[0] + dy * gDir[1] + dz * gDir[2]) / dist;
    if (align > maxVerticalAlign) return;
    for (const s of getBresenham3DLine(pa, pb)) pushPath(s);
  };

  for (const { a: ia, b: ib } of edges) {
    const pa: [number, number, number] = [
      Math.round(pos[ia]![0]),
      Math.round(pos[ia]![1]),
      Math.round(pos[ia]![2])
    ];
    const pb: [number, number, number] = [
      Math.round(pos[ib]![0]),
      Math.round(pos[ib]![1]),
      Math.round(pos[ib]![2])
    ];
    bridgeChord(pa, pb, maxBridgeCardinal);
  }

  const pathDiagNeigh: [number, number][] = [
    [stepU, stepV],
    [stepU, -stepV],
    [-stepU, stepV],
    [-stepU, -stepV]
  ];
  for (let ni = 0; ni < nodes.length; ni++) {
    for (const [du, dv] of pathDiagNeigh) {
      const bj = nodeIndexByKey.get(`${nodes[ni]!.iu + du},${nodes[ni]!.iv + dv}`);
      if (bj === undefined || bj <= ni) continue;
      const pa: [number, number, number] = [
        Math.round(pos[ni]![0]),
        Math.round(pos[ni]![1]),
        Math.round(pos[ni]![2])
      ];
      const pb: [number, number, number] = [
        Math.round(pos[bj]![0]),
        Math.round(pos[bj]![1]),
        Math.round(pos[bj]![2])
      ];
      bridgeChord(pa, pb, maxBridgeDiag);
    }
  }

  return path;
}

/** Projects a point onto the plane through planePoint with given normal; returns integer voxel coords. */
export function projectPointOntoPlane(
  point: [number, number, number],
  planePoint: [number, number, number],
  normal: Vec3Like
): [number, number, number] {
  const dx = point[0] - planePoint[0];
  const dy = point[1] - planePoint[1];
  const dz = point[2] - planePoint[2];
  const dot = dx * normal.x + dy * normal.y + dz * normal.z;
  return [
    Math.round(point[0] - dot * normal.x),
    Math.round(point[1] - dot * normal.y),
    Math.round(point[2] - dot * normal.z)
  ];
}

/** Returns all voxels along a 3D line between a and b (6-connected path). */
export function getBresenham3DLine(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number][] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz), 1);
  const positions: [number, number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(a[0] + t * dx);
    const y = Math.round(a[1] + t * dy);
    const z = Math.round(a[2] + t * dz);
    const k = `${x},${y},${z}`;
    if (!seen.has(k)) {
      seen.add(k);
      positions.push([x, y, z]);
    }
  }
  return positions;
}

export function getAxisAlignedLine(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number][] {
  const dx = Math.abs(b[0] - a[0]);
  const dy = Math.abs(b[1] - a[1]);
  const dz = Math.abs(b[2] - a[2]);
  const positions: [number, number, number][] = [];
  if (dx >= dy && dx >= dz) {
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    for (let x = x0; x <= x1; x++) positions.push([x, a[1], a[2]]);
  } else if (dy >= dx && dy >= dz) {
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    for (let y = y0; y <= y1; y++) positions.push([a[0], y, a[2]]);
  } else {
    const z0 = Math.min(a[2], b[2]);
    const z1 = Math.max(a[2], b[2]);
    for (let z = z0; z <= z1; z++) positions.push([a[0], a[1], z]);
  }
  return positions;
}

export function getAxisAlignedPlaneFromNormal(
  a: [number, number, number],
  b: [number, number, number],
  faceNormal: Vec3Like,
  hollow = false,
  hollowWallThickness = 1
): [number, number, number][] {
  const ax = Math.abs(faceNormal.x);
  const ay = Math.abs(faceNormal.y);
  const az = Math.abs(faceNormal.z);
  const fixedAxis = (ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2) as 0 | 1 | 2;
  const positions: [number, number, number][] = [];
  if (fixedAxis === 0) {
    const x = a[0];
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    const z0 = Math.min(a[2], b[2]);
    const z1 = Math.max(a[2], b[2]);
    for (let py = y0; py <= y1; py++) for (let pz = z0; pz <= z1; pz++) positions.push([x, py, pz]);
  } else if (fixedAxis === 1) {
    const y = a[1];
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const z0 = Math.min(a[2], b[2]);
    const z1 = Math.max(a[2], b[2]);
    for (let px = x0; px <= x1; px++) for (let pz = z0; pz <= z1; pz++) positions.push([px, y, pz]);
  } else {
    const z = a[2];
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    for (let px = x0; px <= x1; px++) for (let py = y0; py <= y1; py++) positions.push([px, py, z]);
  }
  if (!hollow) return positions;
  return hollowSolidToShell(positions, hollowWallThickness, neighborsInFixedPlane(fixedAxis));
}

/** Disk in the plane normal to `faceNormal`, center at `center`, radius to `edge` in the two free axes (integer lattice). */
export function getAxisAlignedCircleFromNormal(
  center: [number, number, number],
  edge: [number, number, number],
  faceNormal: Vec3Like,
  hollow = false,
  hollowWallThickness = 1
): [number, number, number][] {
  const ax = Math.abs(faceNormal.x);
  const ay = Math.abs(faceNormal.y);
  const az = Math.abs(faceNormal.z);
  const fixedAxis = (ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2) as 0 | 1 | 2;

  let cu: number;
  let cv: number;
  let eu: number;
  let ev: number;
  const build = (u: number, v: number): [number, number, number] => {
    if (fixedAxis === 0) return [center[0], u, v];
    if (fixedAxis === 1) return [u, center[1], v];
    return [u, v, center[2]];
  };

  if (fixedAxis === 0) {
    cu = center[1];
    cv = center[2];
    eu = edge[1];
    ev = edge[2];
  } else if (fixedAxis === 1) {
    cu = center[0];
    cv = center[2];
    eu = edge[0];
    ev = edge[2];
  } else {
    cu = center[0];
    cv = center[1];
    eu = edge[0];
    ev = edge[1];
  }

  const du = eu - cu;
  const dv = ev - cv;
  const rSq = du * du + dv * dv;
  if (rSq === 0) return [build(cu, cv)];

  const ru = Math.ceil(Math.sqrt(rSq));
  const filled: [number, number, number][] = [];
  for (let u = cu - ru; u <= cu + ru; u++) {
    for (let v = cv - ru; v <= cv + ru; v++) {
      const ddu = u - cu;
      const ddv = v - cv;
      if (ddu * ddu + ddv * ddv <= rSq) filled.push(build(u, v));
    }
  }

  if (!hollow) return filled;
  return hollowSolidToShell(filled, hollowWallThickness, neighborsInFixedPlane(fixedAxis));
}

/**
 * Right cylinder or linear taper along the axis through `faceNormal`: base disk from `center` to `edge`
 * in the plane, then extruded by `depth` voxel steps (same layer count as cuboid: base + |depth| offsets).
 * `taperPct` 0 = cylinder; 100 = radius linearly to zero at the far end (cone); between = frustum.
 */
export function getAxisAlignedCylinder(
  center: [number, number, number],
  edge: [number, number, number],
  faceNormal: Vec3Like,
  depth: number,
  taperPct: number,
  hollow = false,
  hollowWallThickness = 1
): [number, number, number][] {
  if (depth === 0) {
    return getAxisAlignedCircleFromNormal(
      center,
      edge,
      faceNormal,
      hollow,
      hollowWallThickness
    );
  }

  const ax = Math.abs(faceNormal.x);
  const ay = Math.abs(faceNormal.y);
  const az = Math.abs(faceNormal.z);
  const fixedAxis = (ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2) as 0 | 1 | 2;

  let cu: number;
  let cv: number;
  let eu: number;
  let ev: number;
  const build = (u: number, v: number, w: number): [number, number, number] => {
    if (fixedAxis === 0) return [w, u, v];
    if (fixedAxis === 1) return [u, w, v];
    return [u, v, w];
  };

  if (fixedAxis === 0) {
    cu = center[1];
    cv = center[2];
    eu = edge[1];
    ev = edge[2];
  } else if (fixedAxis === 1) {
    cu = center[0];
    cv = center[2];
    eu = edge[0];
    ev = edge[2];
  } else {
    cu = center[0];
    cv = center[1];
    eu = edge[0];
    ev = edge[1];
  }

  const baseW = center[fixedAxis];
  const du = eu - cu;
  const dv = ev - cv;
  const baseRSq = du * du + dv * dv;

  const comp = [faceNormal.x, faceNormal.y, faceNormal.z][fixedAxis];
  const step = comp > 0 ? 1 : -1;
  const layers = Math.abs(depth);
  const dir = depth > 0 ? step : -step;
  const taper = Math.min(100, Math.max(0, taperPct));

  const seen = new Set<string>();
  const positions: [number, number, number][] = [];

  const addDiskAtW = (w: number, rSq: number) => {
    if (rSq <= 0) {
      const p = build(cu, cv, w);
      const key = `${p[0]},${p[1]},${p[2]}`;
      if (!seen.has(key)) {
        seen.add(key);
        positions.push(p);
      }
      return;
    }
    const ru = Math.ceil(Math.sqrt(rSq));
    for (let u = cu - ru; u <= cu + ru; u++) {
      for (let v = cv - ru; v <= cv + ru; v++) {
        const ddu = u - cu;
        const ddv = v - cv;
        if (ddu * ddu + ddv * ddv <= rSq) {
          const p = build(u, v, w);
          const key = `${p[0]},${p[1]},${p[2]}`;
          if (!seen.has(key)) {
            seen.add(key);
            positions.push(p);
          }
        }
      }
    }
  };

  for (let k = 0; k <= layers; k++) {
    const w = baseW + dir * k;
    let rSq = baseRSq;
    if (taper > 0 && layers > 0) {
      const scale = 1 - (taper / 100) * (k / layers);
      rSq = baseRSq * scale * scale;
    }
    addDiskAtW(w, rSq);
  }

  if (!hollow) return positions;
  return hollowSolidToShell(positions, hollowWallThickness, NEIGHBORS6);
}

export function getAxisAlignedCuboid(
  a: [number, number, number],
  b: [number, number, number],
  faceNormal: Vec3Like,
  depth: number,
  hollow = false,
  hollowWallThickness = 1
): [number, number, number][] {
  const ax = Math.abs(faceNormal.x);
  const ay = Math.abs(faceNormal.y);
  const az = Math.abs(faceNormal.z);
  const fixedAxis = (ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2) as 0 | 1 | 2;
  const planePositions = getAxisAlignedPlaneFromNormal(a, b, faceNormal, false);
  if (depth === 0) {
    if (!hollow) return planePositions;
    return hollowSolidToShell(
      planePositions,
      hollowWallThickness,
      neighborsInFixedPlane(fixedAxis)
    );
  }
  const positions: [number, number, number][] = [...planePositions];
  const axis = fixedAxis;
  const comp = [faceNormal.x, faceNormal.y, faceNormal.z][axis];
  const step = comp > 0 ? 1 : -1;
  const layers = Math.abs(depth);
  const dir = depth > 0 ? step : -step;
  for (let k = 1; k <= layers; k++) {
    const dk = dir * k;
    for (const [px, py, pz] of planePositions) {
      const pos: [number, number, number] = [px, py, pz];
      pos[axis] += dk;
      positions.push(pos);
    }
  }
  if (!hollow) return positions;
  return hollowSolidToShell(positions, hollowWallThickness, NEIGHBORS6);
}

const PIP_EDGE_TOL = 1e-6;

/** Point (px,py) on segment from (x0,y0) to (x1,y1) (within tolerance). */
function pointOnSegment(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < PIP_EDGE_TOL * PIP_EDGE_TOL)
    return Math.abs(px - x0) < PIP_EDGE_TOL && Math.abs(py - y0) < PIP_EDGE_TOL;
  let t = ((px - x0) * dx + (py - y0) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x0 + t * dx;
  const projY = y0 + t * dy;
  return Math.abs(px - projX) <= PIP_EDGE_TOL && Math.abs(py - projY) <= PIP_EDGE_TOL;
}

/** Ray-casting point-in-polygon (2D). Point is inside if ray in +x crosses odd number of edges. Boundary (edge or vertex) counts as inside. */
function pointInPolygon2D(px: number, py: number, polygon: [number, number][]): boolean {
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const [xi, yi] = polygon[i];
    if (Math.abs(px - xi) <= PIP_EDGE_TOL && Math.abs(py - yi) <= PIP_EDGE_TOL) return true;
  }
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (pointOnSegment(px, py, xj, yj, xi, yi)) return true;
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py) {
      const t = (py - yj) / (yi - yj);
      const x = xj + t * (xi - xj);
      if (px < x) inside = !inside;
    }
  }
  return inside;
}

/** Voxel corner coordinates can be large; plane tests need slack vs float error. */
const COPLANAR_FILL_TOL = 0.08;

/** True if all points lie on the plane through a,b,c (within tolerance). */
export function areCoplanar(
  points: [number, number, number][],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  tol = 1e-6
): boolean {
  const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const normal = new THREE.Vector3().crossVectors(ab, ac);
  if (normal.lengthSq() < tol * tol) return true; // degenerate, treat as coplanar
  normal.normalize();
  const d = -normal.x * a[0] - normal.y * a[1] - normal.z * a[2];
  for (const p of points) {
    const dist = Math.abs(normal.x * p[0] + normal.y * p[1] + normal.z * p[2] + d);
    if (dist > tol) return false;
  }
  return true;
}

function findNonCollinearTriple(
  points: [number, number, number][]
): [number, number, number] | null {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const a = points[i];
        const b = points[j];
        const c = points[k];
        const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
        const cross = new THREE.Vector3().crossVectors(ab, ac);
        if (cross.lengthSq() >= 1e-12) return [i, j, k];
      }
    }
  }
  return null;
}

/**
 * Voxel centers inside a closed coplanar polygon (vertex loop). Returns `null` if points are not
 * coplanar or do not span a plane. Same fill rule as polygon stroke for 4+ coplanar vertices.
 */
export function getCoplanarPolygonFillPositions(
  points: [number, number, number][]
): [number, number, number][] | null {
  if (points.length < 3) return null;
  const triple = findNonCollinearTriple(points);
  if (triple === null) return null;
  const a = points[triple[0]];
  const b = points[triple[1]];
  const c = points[triple[2]];
  if (!areCoplanar(points, a, b, c, COPLANAR_FILL_TOL)) return null;

  const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const normal = new THREE.Vector3().crossVectors(ab, ac);
  const ax = Math.abs(normal.x);
  const ay = Math.abs(normal.y);
  const az = Math.abs(normal.z);
  const dropAxis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const uAxis = dropAxis === 0 ? 1 : 0;
  const vAxis = dropAxis === 2 ? 1 : 2;
  const to2D = (p: [number, number, number]) => [p[uAxis], p[vAxis]] as [number, number];
  const polygon2D = points.map(to2D);
  const minU = Math.min(...polygon2D.map(([u]) => u));
  const maxU = Math.max(...polygon2D.map(([u]) => u));
  const minV = Math.min(...polygon2D.map(([, v]) => v));
  const maxV = Math.max(...polygon2D.map(([, v]) => v));
  const floorU = Math.floor(minU);
  const ceilU = Math.ceil(maxU);
  const floorV = Math.floor(minV);
  const ceilV = Math.ceil(maxV);
  const n = normal.clone().normalize();
  const d = -n.x * a[0] - n.y * a[1] - n.z * a[2];
  const positions: [number, number, number][] = [];
  const coord = [0, 0, 0] as [number, number, number];
  for (let u = floorU; u <= ceilU; u++) {
    for (let v = floorV; v <= ceilV; v++) {
      const corners: [number, number][] = [
        [u, v],
        [u + 1, v],
        [u + 1, v + 1],
        [u, v + 1]
      ];
      const pip = corners.some(([cx, cy]) => pointInPolygon2D(cx, cy, polygon2D));
      if (!pip) continue;
      coord[uAxis] = u;
      coord[vAxis] = v;
      const nd = n.getComponent(dropAxis);
      if (Math.abs(nd) < 1e-9) continue;
      const cx = u + 0.5;
      const cy = v + 0.5;
      const third = -(d + n.getComponent(uAxis) * cx + n.getComponent(vAxis) * cy) / nd;
      coord[dropAxis] = Math.round(third);
      positions.push([...coord]);
    }
  }
  if (positions.length === 0) return null;
  return positions;
}

export function getPolygonVoxels(points: [number, number, number][]): [number, number, number][] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];
  if (points.length === 2) return getBresenham3DLine(points[0], points[1]);
  if (points.length === 3) {
    const [a, b, c] = points;
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const normal = new THREE.Vector3().crossVectors(ab, ac);
    const ax = Math.abs(normal.x);
    const ay = Math.abs(normal.y);
    const az = Math.abs(normal.z);
    const dropAxis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    const uAxis = dropAxis === 0 ? 1 : 0;
    const vAxis = dropAxis === 2 ? 1 : 2;
    const to2D = (p: [number, number, number]) => [p[uAxis], p[vAxis]] as [number, number];
    const a2 = to2D(a);
    const b2 = to2D(b);
    const c2 = to2D(c);
    const v0x = b2[0] - a2[0];
    const v0y = b2[1] - a2[1];
    const v1x = c2[0] - a2[0];
    const v1y = c2[1] - a2[1];
    const denom = v0x * v1y - v0y * v1x;
    if (Math.abs(denom) < 1e-9) return getAxisAlignedLine(a, b);
    const triTol = 1e-6;
    const inTriangle = (pu: number, pv: number) => {
      const px = pu - a2[0];
      const py = pv - a2[1];
      const s = (px * v1y - py * v1x) / denom;
      const t = (py * v0x - px * v0y) / denom;
      return s >= -triTol && t >= -triTol && s + t <= 1 + triTol;
    };
    const n = normal.clone().normalize();
    const d = -n.x * a[0] - n.y * a[1] - n.z * a[2];
    const minU = Math.min(a2[0], b2[0], c2[0]);
    const maxU = Math.max(a2[0], b2[0], c2[0]);
    const minV = Math.min(a2[1], b2[1], c2[1]);
    const maxV = Math.max(a2[1], b2[1], c2[1]);
    const floorU = Math.floor(minU);
    const ceilU = Math.ceil(maxU);
    const floorV = Math.floor(minV);
    const ceilV = Math.ceil(maxV);
    const positions: [number, number, number][] = [];
    const coord: [number, number, number] = [0, 0, 0];
    for (let u = floorU; u <= ceilU; u++) {
      for (let v = floorV; v <= ceilV; v++) {
        const corners2D: [number, number][] = [
          [u, v],
          [u + 1, v],
          [u + 1, v + 1],
          [u, v + 1]
        ];
        const inside = corners2D.some(([pu, pv]) => inTriangle(pu, pv));
        if (!inside) continue;
        const nd = n.getComponent(dropAxis);
        if (Math.abs(nd) < 1e-9) continue;
        const cu = u + 0.5;
        const cv = v + 0.5;
        const third = -(d + n.getComponent(uAxis) * cu + n.getComponent(vAxis) * cv) / nd;
        coord[uAxis] = u;
        coord[vAxis] = v;
        coord[dropAxis] = Math.round(third);
        positions.push([...coord]);
      }
    }
    return positions;
  }
  // 4+ points: if coplanar, fill actual polygon with 2D point-in-polygon; else 3D convex hull
  const coplanarFill = getCoplanarPolygonFillPositions(points);
  if (coplanarFill !== null) {
    return coplanarFill;
  }

  const vecs = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const hull = new ConvexHull();
  hull.setFromPoints(vecs);
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
    minZ = Math.min(minZ, p[2]);
    maxZ = Math.max(maxZ, p[2]);
  }
  const positions: [number, number, number][] = [];
  const test = new THREE.Vector3();
  for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      for (let z = Math.floor(minZ); z <= Math.ceil(maxZ); z++) {
        test.set(x, y, z);
        if (hull.containsPoint(test)) positions.push([x, y, z]);
      }
    }
  }
  return positions;
}

/**
 * Closed polyline along `points` (last edge connects to first). For walls / outlines, not area fill.
 */
export function getPolygonClosedOutlineVoxels(
  points: [number, number, number][]
): [number, number, number][] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]!];
  if (points.length === 2) {
    return getBresenham3DLine(points[0]!, points[1]!);
  }
  const seen = new Set<string>();
  const out: [number, number, number][] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    for (const p of getBresenham3DLine(a, b)) {
      const k = `${p[0]},${p[1]},${p[2]}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(p);
      }
    }
  }
  return out;
}

function projectPointOntoPlaneThroughOrigin(
  p: [number, number, number],
  planeOrigin: [number, number, number],
  n: THREE.Vector3
): [number, number, number] {
  const ox = p[0] - planeOrigin[0];
  const oy = p[1] - planeOrigin[1];
  const oz = p[2] - planeOrigin[2];
  const t = n.x * ox + n.y * oy + n.z * oz;
  return [p[0] - n.x * t, p[1] - n.y * t, p[2] - n.z * t];
}

function solidPolygonNormalToDropUV(n: THREE.Vector3): {
  dropAxis: 0 | 1 | 2;
  uAxis: 0 | 1 | 2;
  vAxis: 0 | 1 | 2;
} {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  const dropAxis = (ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2) as 0 | 1 | 2;
  const uAxis = (dropAxis === 0 ? 1 : 0) as 0 | 1 | 2;
  const vAxis = (dropAxis === 2 ? 1 : 2) as 0 | 1 | 2;
  return { dropAxis, uAxis, vAxis };
}

/** Integer (u,v) cells along a 2D segment (inclusive). */
function bresenham2DCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const cells: [number, number][] = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}

/**
 * Filled base for solid polygon extrusion: corners may be non-coplanar in world space. Vertices are projected
 * onto the plane through `planeOrigin` with normal `initialExtrusionNormal` (from the first click),
 * then filled like the polygon tool; voxels lie on that plane.
 */
export function getSolidPolygonBasePositions(
  points: [number, number, number][],
  planeOrigin: [number, number, number],
  initialExtrusionNormal: Vec3Like
): [number, number, number][] | null {
  if (points.length < 2) return null;
  const n = new THREE.Vector3(
    initialExtrusionNormal.x,
    initialExtrusionNormal.y,
    initialExtrusionNormal.z
  );
  if (n.lengthSq() < 1e-12) return null;
  n.normalize();

  const { dropAxis, uAxis, vAxis } = solidPolygonNormalToDropUV(n);
  const dPlane = -n.x * planeOrigin[0] - n.y * planeOrigin[1] - n.z * planeOrigin[2];

  const to2DProj = (p: [number, number, number]) => {
    const proj = projectPointOntoPlaneThroughOrigin(p, planeOrigin, n);
    return [proj[uAxis], proj[vAxis]] as [number, number];
  };

  const liftUV = (u: number, v: number): [number, number, number] => {
    const nd = n.getComponent(dropAxis);
    if (Math.abs(nd) < 1e-9) return [planeOrigin[0], planeOrigin[1], planeOrigin[2]];
    const cu = u + 0.5;
    const cv = v + 0.5;
    const third = -(dPlane + n.getComponent(uAxis) * cu + n.getComponent(vAxis) * cv) / nd;
    const coord: [number, number, number] = [0, 0, 0];
    coord[uAxis] = u;
    coord[vAxis] = v;
    coord[dropAxis] = Math.round(third);
    return coord;
  };

  const dedupe = (cells: [number, number, number][]) => {
    const seen = new Set<string>();
    const out: [number, number, number][] = [];
    for (const c of cells) {
      const k = `${c[0]},${c[1]},${c[2]}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(c);
      }
    }
    return out.length > 0 ? out : null;
  };

  if (points.length === 2) {
    const a2 = to2DProj(points[0]!);
    const b2 = to2DProj(points[1]!);
    const line2d = bresenham2DCells(
      Math.round(a2[0]),
      Math.round(a2[1]),
      Math.round(b2[0]),
      Math.round(b2[1])
    );
    const lifted = line2d.map(([u, v]) => liftUV(u, v));
    return dedupe(lifted);
  }

  if (points.length === 3) {
    const a = points[0]!;
    const b = points[1]!;
    const c = points[2]!;
    const a2 = to2DProj(a);
    const b2 = to2DProj(b);
    const c2 = to2DProj(c);
    const v0x = b2[0] - a2[0];
    const v0y = b2[1] - a2[1];
    const v1x = c2[0] - a2[0];
    const v1y = c2[1] - a2[1];
    const denom = v0x * v1y - v0y * v1x;
    const triTol = 1e-6;
    if (Math.abs(denom) < 1e-9) {
      const line2d = bresenham2DCells(
        Math.round(a2[0]),
        Math.round(a2[1]),
        Math.round(c2[0]),
        Math.round(c2[1])
      );
      const lifted = line2d.map(([u, v]) => liftUV(u, v));
      return dedupe(lifted);
    }
    const inTriangle = (pu: number, pv: number) => {
      const px = pu - a2[0];
      const py = pv - a2[1];
      const s = (px * v1y - py * v1x) / denom;
      const t = (py * v0x - px * v0y) / denom;
      return s >= -triTol && t >= -triTol && s + t <= 1 + triTol;
    };
    const minU = Math.min(a2[0], b2[0], c2[0]);
    const maxU = Math.max(a2[0], b2[0], c2[0]);
    const minV = Math.min(a2[1], b2[1], c2[1]);
    const maxV = Math.max(a2[1], b2[1], c2[1]);
    const floorU = Math.floor(minU);
    const ceilU = Math.ceil(maxU);
    const floorV = Math.floor(minV);
    const ceilV = Math.ceil(maxV);
    const lifted: [number, number, number][] = [];
    for (let u = floorU; u <= ceilU; u++) {
      for (let v = floorV; v <= ceilV; v++) {
        const corners2D: [number, number][] = [
          [u, v],
          [u + 1, v],
          [u + 1, v + 1],
          [u, v + 1]
        ];
        if (!corners2D.some(([pu, pv]) => inTriangle(pu, pv))) continue;
        lifted.push(liftUV(u, v));
      }
    }
    return dedupe(lifted);
  }

  const polygon2D = points.map(to2DProj);
  const minU = Math.min(...polygon2D.map(([u]) => u));
  const maxU = Math.max(...polygon2D.map(([u]) => u));
  const minV = Math.min(...polygon2D.map(([, v]) => v));
  const maxV = Math.max(...polygon2D.map(([, v]) => v));
  const floorU = Math.floor(minU);
  const ceilU = Math.ceil(maxU);
  const floorV = Math.floor(minV);
  const ceilV = Math.ceil(maxV);
  const lifted: [number, number, number][] = [];
  for (let u = floorU; u <= ceilU; u++) {
    for (let v = floorV; v <= ceilV; v++) {
      const corners: [number, number][] = [
        [u, v],
        [u + 1, v],
        [u + 1, v + 1],
        [u, v + 1]
      ];
      if (!corners.some(([cx, cy]) => pointInPolygon2D(cx, cy, polygon2D))) continue;
      lifted.push(liftUV(u, v));
    }
  }
  return dedupe(lifted);
}

/**
 * Extrude a filled base layer along the dominant axis of `initialExtrusionNormal` (voxel steps).
 */
export function extrudeSolidPolygonBaseAlongNormal(
  baseLayer: [number, number, number][],
  initialExtrusionNormal: Vec3Like,
  depth: number,
  hollow = false,
  hollowWallThickness = 1
): [number, number, number][] {
  if (baseLayer.length === 0) return [];
  const n = new THREE.Vector3(
    initialExtrusionNormal.x,
    initialExtrusionNormal.y,
    initialExtrusionNormal.z
  );
  if (n.lengthSq() < 1e-12) return [];
  n.normalize();

  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  const fixedAxis = (ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2) as 0 | 1 | 2;
  const comp = n.getComponent(fixedAxis);
  const step = comp > 0 ? 1 : -1;
  const layers = Math.abs(depth);
  const dir = depth > 0 ? step : -step;

  const seen = new Set<string>();
  const positions: [number, number, number][] = [];
  for (const [px, py, pz] of baseLayer) {
    for (let k = 0; k <= layers; k++) {
      const dk = dir * k;
      const pos: [number, number, number] = [px, py, pz];
      pos[fixedAxis] += dk;
      const key = `${pos[0]},${pos[1]},${pos[2]}`;
      if (!seen.has(key)) {
        seen.add(key);
        positions.push(pos);
      }
    }
  }

  if (!hollow) return positions;
  return hollowSolidToShell(positions, hollowWallThickness, NEIGHBORS6);
}

/**
 * Projected fill from corners + extrusion along first-click normal (same as
 * `extrudeSolidPolygonBaseAlongNormal(getSolidPolygonBasePositions(...), ...)`).
 */
export function getSolidPolygonStrokeVoxels(
  points: [number, number, number][],
  planeOrigin: [number, number, number],
  initialExtrusionNormal: Vec3Like | null,
  depth: number,
  hollow = false,
  hollowWallThickness = 1
): [number, number, number][] {
  if (!initialExtrusionNormal) return [];
  const baseRaw = getSolidPolygonBasePositions(points, planeOrigin, initialExtrusionNormal);
  if (!baseRaw || baseRaw.length === 0) return [];
  return extrudeSolidPolygonBaseAlongNormal(
    baseRaw,
    initialExtrusionNormal,
    depth,
    hollow,
    hollowWallThickness
  );
}

/** Signed depth per world axis for HUD (matches solid polygon extrusion direction). */
export function getSolidPolygonDepthDeltaDisplay(
  initialExtrusionNormal: Vec3Like | null,
  depth: number
): { dx: number; dy: number; dz: number } {
  if (!initialExtrusionNormal) return { dx: 0, dy: 0, dz: 0 };

  const n = new THREE.Vector3(
    initialExtrusionNormal.x,
    initialExtrusionNormal.y,
    initialExtrusionNormal.z
  );
  if (n.lengthSq() < 1e-12) return { dx: 0, dy: 0, dz: 0 };
  n.normalize();

  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const d: [number, number, number] = [0, 0, 0];
  d[axis] = depth;
  return { dx: d[0]!, dy: d[1]!, dz: d[2]! };
}
