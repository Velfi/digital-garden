/**
 * Raycasting and grid snapping helpers for VoxelCanvas. No Svelte; pure Three + voxel pick.
 */
import * as THREE from 'three';
import { ddaPickVoxel, maxRayDistanceForVoxels } from './voxelRayDda';
import type { FaceNormal, PlaneAxis, Tool, Voxel } from '../store/index';

export type MeshManagerLike = {
  getMeshesByBucket: () => Map<string, { mesh: THREE.Object3D }>;
};

export type RaycastTargetsInput = {
  meshManager: MeshManagerLike | null;
  polygonPhase: 'placing' | null;
  roofPhase: 'placing' | null;
  polygonPointsMesh: THREE.InstancedMesh | null;
  ropePhase: 'placing' | 'tension' | null;
  ropePointsMesh: THREE.InstancedMesh | null;
};

export function getRaycastTargetsFrom(input: RaycastTargetsInput): THREE.Object3D[] {
  const targets: THREE.Object3D[] = [];
  const byBucket = input.meshManager?.getMeshesByBucket();
  if (byBucket) {
    for (const { mesh } of byBucket.values()) {
      targets.push(mesh);
    }
  }
  if ((input.polygonPhase || input.roofPhase) && input.polygonPointsMesh) {
    targets.push(input.polygonPointsMesh);
  }
  if (input.ropePhase && input.ropePointsMesh) {
    targets.push(input.ropePointsMesh);
  }
  return targets;
}

export function snapToGrid(point: THREE.Vector3): [number, number, number] {
  return [Math.round(point.x), Math.round(point.y), Math.round(point.z)];
}

export function dominantAxisNormal(n: THREE.Vector3): FaceNormal {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  if (ax >= ay && ax >= az) return [Math.sign(n.x) || 1, 0, 0];
  if (ay >= ax && ay >= az) return [0, Math.sign(n.y) || 1, 0];
  return [0, 0, Math.sign(n.z) || 1];
}

export function axisVector(axis: 0 | 1 | 2): THREE.Vector3 {
  const v = new THREE.Vector3(0, 0, 0);
  v.setComponent(axis, 1);
  return v;
}

export function getDominantAxisOfNormal(n: THREE.Vector3): 0 | 1 | 2 {
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  if (ax >= ay && ax >= az) return 0;
  if (ay >= az) return 1;
  return 2;
}

export function getFaceNormalFromHit(
  hit: THREE.Intersection,
  worldQuaternion: THREE.Quaternion
): FaceNormal | null {
  if (!hit.face) return null;
  hit.object.getWorldQuaternion(worldQuaternion);
  const n = hit.face.normal.clone().applyQuaternion(worldQuaternion);
  return dominantAxisNormal(n);
}

export type GetIntersectionParams = {
  camera: THREE.Camera | null;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  renderingMode: 'greedy' | 'marchingCubes' | 'ray';
  voxels: Map<string, Voxel>;
  rayPickProxy: THREE.Object3D | null;
  getTargets: () => THREE.Object3D[];
};

export function getIntersectionFrom(params: GetIntersectionParams): THREE.Intersection | null {
  const { camera, raycaster, pointer, renderingMode, voxels, rayPickProxy, getTargets } = params;
  if (!camera) return null;
  raycaster.setFromCamera(pointer, camera);
  if (renderingMode === 'ray') {
    const r = raycaster.ray;
    const maxDist = maxRayDistanceForVoxels(voxels, [r.origin.x, r.origin.y, r.origin.z]);
    const hit = ddaPickVoxel(
      r.origin.x,
      r.origin.y,
      r.origin.z,
      r.direction.x,
      r.direction.y,
      r.direction.z,
      voxels,
      maxDist
    );
    if (!hit || !rayPickProxy) return null;
    const p = new THREE.Vector3(hit.point[0], hit.point[1], hit.point[2]);
    const fn = new THREE.Vector3(hit.faceNormal[0], hit.faceNormal[1], hit.faceNormal[2]);
    return {
      distance: r.origin.distanceTo(p),
      point: p,
      face: { normal: fn, materialIndex: 0 } as THREE.Face,
      object: rayPickProxy
    };
  }
  const targets = getTargets();
  const intersects = raycaster.intersectObjects(targets, false);
  return intersects.length > 0 ? intersects[0]! : null;
}

export function getIntersectionWithLockedPlane(
  raycaster: THREE.Raycaster,
  axis: 0 | 1 | 2,
  lockedValue: number
): [number, number, number] | null {
  const normal = new THREE.Vector3(0, 0, 0).setComponent(axis, 1);
  const point = new THREE.Vector3(0, 0, 0).setComponent(axis, lockedValue);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
  const target = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(plane, target);
  if (!hit) return null;
  if (target.clone().sub(raycaster.ray.origin).dot(raycaster.ray.direction) < 0) return null;
  return snapToGrid(target);
}

export function getIntersectionWithPlane(
  raycaster: THREE.Raycaster,
  planePoint: THREE.Vector3,
  normal: THREE.Vector3
): [number, number, number] | null {
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    normal.clone().normalize(),
    planePoint
  );
  const target = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(plane, target);
  if (!hit) return null;
  if (target.clone().sub(raycaster.ray.origin).dot(raycaster.ray.direction) < 0) return null;
  return snapToGrid(target);
}

export function getEffectivePlaneNormal(
  dragFaceNormal: THREE.Vector3 | null,
  dragPlaneAxisOverride: 0 | 1 | 2 | null,
  planeAxis: PlaneAxis
): THREE.Vector3 | null {
  if (!dragFaceNormal) return null;
  if (dragPlaneAxisOverride !== null) return axisVector(dragPlaneAxisOverride);
  if (planeAxis !== 'auto') return axisVector(planeAxis);
  return dragFaceNormal;
}

export function getCameraPlaneNormal(
  camera: THREE.Camera | null
): { x: number; y: number; z: number } | undefined {
  if (!camera) return undefined;
  const v = new THREE.Vector3();
  camera.getWorldDirection(v);
  return { x: v.x, y: v.y, z: v.z };
}

const pointerScratch = new THREE.Vector3();
const axisScratch = new THREE.Vector3();

export function getAddPositionFromHit(
  hit: THREE.Intersection,
  worldQuaternion: THREE.Quaternion
): [number, number, number] | null {
  if (!hit.face) return null;
  hit.object.getWorldQuaternion(worldQuaternion);
  const worldNormal = hit.face.normal.clone().applyQuaternion(worldQuaternion);
  const [nx, ny, nz] = dominantAxisNormal(worldNormal);
  pointerScratch.copy(hit.point).addScaledVector(axisScratch.set(nx, ny, nz), 0.5);
  return snapToGrid(pointerScratch);
}

export function getVoxelPositionFromHit(
  hit: THREE.Intersection,
  worldQuaternion: THREE.Quaternion
): [number, number, number] | null {
  const mesh = hit.object as THREE.InstancedMesh | THREE.Mesh;
  const positions = mesh.userData?.positions as [number, number, number][] | undefined;
  if (positions && hit.instanceId != null) {
    return positions[hit.instanceId] ?? null;
  }
  if (!hit.face) return null;
  mesh.getWorldQuaternion(worldQuaternion);
  const worldNormal = hit.face.normal.clone().applyQuaternion(worldQuaternion);
  const [nx, ny, nz] = dominantAxisNormal(worldNormal);
  pointerScratch.copy(hit.point).addScaledVector(axisScratch.set(nx, ny, nz), -0.5);
  return snapToGrid(pointerScratch);
}

export function getStrokeStartFromHit(
  tool: Tool,
  hit: THREE.Intersection,
  worldQuaternion: THREE.Quaternion
): [number, number, number] | null {
  return tool === 'voxel' || tool === 'clay'
    ? getAddPositionFromHit(hit, worldQuaternion)
    : getVoxelPositionFromHit(hit, worldQuaternion);
}
