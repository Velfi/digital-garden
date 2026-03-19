import { describe, it, expect } from 'vitest';
import { rotatePositionAroundOrigin } from './store/shapes';
import { getStampOffsetForFace } from './store/core';
import { getBoundsFromPositions } from './store/index';
import type { FaceNormal } from './store/index';

/** Normalize -0 to 0 for comparison (Object.is(0, -0) is false). */
function norm(arr: [number, number, number]): [number, number, number] {
  return arr.map((n) => (n === 0 ? 0 : n)) as [number, number, number];
}

describe('rotatePositionAroundOrigin', () => {
  it('returns identity for [0,0,0] rotation', () => {
    const pos: [number, number, number] = [1, 2, 3];
    expect(rotatePositionAroundOrigin(pos, [0, 0, 0])).toEqual(pos);
  });

  it('rotateX: 1 quarter-turn maps Y↔Z (Y→-Z, Z→Y)', () => {
    // Implementation: [x, -z, y]
    expect(norm(rotatePositionAroundOrigin([0, 1, 0], [1, 0, 0]))).toEqual([0, 0, 1]);
    expect(norm(rotatePositionAroundOrigin([0, 0, 1], [1, 0, 0]))).toEqual([0, -1, 0]);
  });

  it('rotateY: 1 quarter-turn maps X↔Z (X→Z, Z→-X)', () => {
    // Implementation: [z, y, -x]
    expect(norm(rotatePositionAroundOrigin([1, 0, 0], [0, 1, 0]))).toEqual([0, 0, -1]);
    expect(norm(rotatePositionAroundOrigin([0, 0, 1], [0, 1, 0]))).toEqual([1, 0, 0]);
  });

  it('rotateZ: 1 quarter-turn maps X↔Y (X→-Y, Y→X)', () => {
    // Implementation: [-y, x, z]
    expect(norm(rotatePositionAroundOrigin([1, 0, 0], [0, 0, 1]))).toEqual([0, 1, 0]);
    expect(norm(rotatePositionAroundOrigin([0, 1, 0], [0, 0, 1]))).toEqual([-1, 0, 0]);
  });

  it('4 quarter-turns returns to original', () => {
    const pos: [number, number, number] = [5, -3, 2];
    expect(rotatePositionAroundOrigin(pos, [4, 4, 4])).toEqual(pos);
    expect(rotatePositionAroundOrigin(pos, [1, 1, 1])).not.toEqual(pos);
    expect(
      rotatePositionAroundOrigin(rotatePositionAroundOrigin(pos, [1, 1, 1]), [1, 1, 1])
    ).not.toEqual(pos);
    const rot4 = rotatePositionAroundOrigin(
      rotatePositionAroundOrigin(
        rotatePositionAroundOrigin(rotatePositionAroundOrigin(pos, [1, 0, 0]), [1, 0, 0]),
        [1, 0, 0]
      ),
      [1, 0, 0]
    );
    expect(rot4).toEqual(pos);
  });

  it('composes X then Y then Z correctly', () => {
    // (1,0,0) rotX=1 → (1,0,0), rotY=1 → (0,0,-1), rotZ=1 → (0,0,-1)
    expect(norm(rotatePositionAroundOrigin([1, 0, 0], [1, 1, 1]))).toEqual([0, 0, -1]);
  });
});

describe('getStampOffsetForFace', () => {
  it('places stamp adjacent to +X face of target', () => {
    const target: [number, number, number] = [5, 2, 2];
    const normal: FaceNormal = [1, 0, 0]; // stamp touches +X face
    const bounds = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }; // 1×1×1 stamp
    const [dx, dy, dz] = getStampOffsetForFace(target, normal, bounds);
    expect(dx).toBe(6); // minX + dx = target.x + 1
    expect(dy).toBe(2);
    expect(dz).toBe(2);
  });

  it('places stamp adjacent to -X face of target', () => {
    const target: [number, number, number] = [5, 2, 2];
    const normal: FaceNormal = [-1, 0, 0];
    const bounds = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
    const [dx, dy, dz] = getStampOffsetForFace(target, normal, bounds);
    expect(dx).toBe(4); // maxX + dx = target.x - 1
    expect(dy).toBe(2);
    expect(dz).toBe(2);
  });

  it('places stamp on same plane when normal is zero on axis', () => {
    const target: [number, number, number] = [5, 2, 2];
    const normal: FaceNormal = [0, 1, 0];
    const bounds = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
    const [dx, dy, dz] = getStampOffsetForFace(target, normal, bounds);
    expect(dx).toBe(5);
    expect(dy).toBe(3); // minY + dy = target.y + 1
    expect(dz).toBe(2);
  });

  it('multi-voxel stamp: offset aligns stamp bounds to target face', () => {
    const target: [number, number, number] = [0, 0, 0];
    const normal: FaceNormal = [1, 0, 0];
    const bounds = { minX: -1, minY: -1, minZ: -1, maxX: 1, maxY: 1, maxZ: 1 }; // 3×3×3
    const [dx, dy, dz] = getStampOffsetForFace(target, normal, bounds);
    // Stamp's minX + dx = target.x + 1 = 1, so dx = 1 - (-1) = 2
    expect(dx).toBe(2);
    expect(dy).toBe(1);
    expect(dz).toBe(1);
  });
});

describe('stamp positions (rotate + offset)', () => {
  it('rotated selection + offset produces correct final positions', () => {
    // Single voxel at origin, rotate 1 quarter around Y, place on +X face of (2,0,0)
    const center: [number, number, number] = [0, 0, 0];
    const pos: [number, number, number] = [0, 0, 0];
    const centered: [number, number, number] = [
      pos[0] - center[0],
      pos[1] - center[1],
      pos[2] - center[2]
    ];
    const rotated = rotatePositionAroundOrigin(centered, [0, 1, 0]);
    const uncentered: [number, number, number] = [
      rotated[0] + center[0],
      rotated[1] + center[1],
      rotated[2] + center[2]
    ];
    expect(uncentered).toEqual([0, 0, 0]); // center at origin, single voxel stays

    const bounds = getBoundsFromPositions([uncentered])!;
    const [dx, dy, dz] = getStampOffsetForFace([2, 0, 0], [1, 0, 0] as FaceNormal, bounds);
    const final = [uncentered[0] + dx, uncentered[1] + dy, uncentered[2] + dz];
    expect(final).toEqual([3, 0, 0]); // one voxel past target
  });
});
