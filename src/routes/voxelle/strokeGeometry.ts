import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

export type Vec3Like = { x: number; y: number; z: number };

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
  faceNormal: Vec3Like
): [number, number, number][] {
  const ax = Math.abs(faceNormal.x);
  const ay = Math.abs(faceNormal.y);
  const az = Math.abs(faceNormal.z);
  const fixedAxis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const positions: [number, number, number][] = [];
  if (fixedAxis === 0) {
    const x = a[0];
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    const z0 = Math.min(a[2], b[2]);
    const z1 = Math.max(a[2], b[2]);
    for (let py = y0; py <= y1; py++)
      for (let pz = z0; pz <= z1; pz++) positions.push([x, py, pz]);
  } else if (fixedAxis === 1) {
    const y = a[1];
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const z0 = Math.min(a[2], b[2]);
    const z1 = Math.max(a[2], b[2]);
    for (let px = x0; px <= x1; px++)
      for (let pz = z0; pz <= z1; pz++) positions.push([px, y, pz]);
  } else {
    const z = a[2];
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    for (let px = x0; px <= x1; px++)
      for (let py = y0; py <= y1; py++) positions.push([px, py, z]);
  }
  return positions;
}

export function getAxisAlignedCuboid(
  a: [number, number, number],
  b: [number, number, number],
  faceNormal: Vec3Like,
  depth: number
): [number, number, number][] {
  const planePositions = getAxisAlignedPlaneFromNormal(a, b, faceNormal);
  if (depth === 0) return planePositions;
  const positions: [number, number, number][] = [...planePositions];
  const ax = Math.abs(faceNormal.x);
  const ay = Math.abs(faceNormal.y);
  const az = Math.abs(faceNormal.z);
  const axis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
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
  return positions;
}

export function getPolygonVoxels(points: [number, number, number][]): [number, number, number][] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];
  if (points.length === 2) return getAxisAlignedLine(points[0], points[1]);
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
    const minX = Math.floor(Math.min(a[0], b[0], c[0]));
    const maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
    const minY = Math.floor(Math.min(a[1], b[1], c[1]));
    const maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
    const minZ = Math.floor(Math.min(a[2], b[2], c[2]));
    const maxZ = Math.ceil(Math.max(a[2], b[2], c[2]));
    const positions: [number, number, number][] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const cx = x + 0.5;
          const cy = y + 0.5;
          const cz = z + 0.5;
          const p2: [number, number] = [0, 0];
          p2[0] = [cx, cy, cz][uAxis];
          p2[1] = [cx, cy, cz][vAxis];
          const px = p2[0] - a2[0];
          const py = p2[1] - a2[1];
          const s = (px * v1y - py * v1x) / denom;
          const t = (py * v0x - px * v0y) / denom;
          if (s >= -1e-6 && t >= -1e-6 && s + t <= 1 + 1e-6) {
            positions.push([x, y, z]);
          }
        }
      }
    }
    return positions;
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
