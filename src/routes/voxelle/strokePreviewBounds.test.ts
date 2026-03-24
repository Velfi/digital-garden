import { describe, it, expect } from 'vitest';
import {
  planeStrokeBounds,
  cuboidStrokeBounds,
  cuboidSolidVoxelCount,
  lineStrokeBounds,
  expandStrokePreviewBoundsOriginMirror,
  expandStrokePreviewBoundsAroundCenter,
  inflateStrokePreviewBoundsForDrawBrush
} from './strokePreviewBounds';
import {
  getAxisAlignedPlaneFromNormal,
  getAxisAlignedCuboid,
  getAxisAlignedLine,
  getBresenham3DLine
} from './strokeGeometry';

function boundsFromPositions(positions: [number, number, number][]) {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const [x, y, z] of positions) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function expectBoundsContainAll(
  outer: ReturnType<typeof boundsFromPositions>,
  positions: [number, number, number][]
) {
  for (const [x, y, z] of positions) {
    expect(x).toBeGreaterThanOrEqual(outer.minX);
    expect(x).toBeLessThanOrEqual(outer.maxX);
    expect(y).toBeGreaterThanOrEqual(outer.minY);
    expect(y).toBeLessThanOrEqual(outer.maxY);
    expect(z).toBeGreaterThanOrEqual(outer.minZ);
    expect(z).toBeLessThanOrEqual(outer.maxZ);
  }
}

describe('planeStrokeBounds', () => {
  it('matches brute-force AABB for random planes (Y-normal)', () => {
    for (let i = 0; i < 30; i++) {
      const a: [number, number, number] = [
        Math.floor(Math.random() * 20) - 10,
        3,
        Math.floor(Math.random() * 20) - 10
      ];
      const b: [number, number, number] = [
        Math.floor(Math.random() * 20) - 10,
        3,
        Math.floor(Math.random() * 20) - 10
      ];
      const n = { x: 0, y: 1, z: 0 };
      const brute = boundsFromPositions(getAxisAlignedPlaneFromNormal(a, b, n, false));
      const analytic = planeStrokeBounds(a, b, n);
      expect(analytic).toEqual(brute);
    }
  });

  it('matches brute-force for X and Z dominant normals', () => {
    const pairs: [[number, number, number], { x: number; y: number; z: number }][] = [
      [[0, 0, 0], { x: 1, y: 0, z: 0 }],
      [[2, -1, 5], { x: -1, y: 0.1, z: 0.1 }],
      [[0, 0, 0], { x: 0, y: 0, z: -1 }]
    ];
    for (const [a, n] of pairs) {
      const b: [number, number, number] = [a[0] + 4, a[1] - 3, a[2] + 7];
      const brute = boundsFromPositions(getAxisAlignedPlaneFromNormal(a, b, n, false));
      const analytic = planeStrokeBounds(a, b, n);
      expect(analytic).toEqual(brute);
    }
  });
});

describe('cuboidSolidVoxelCount', () => {
  it('matches solid getAxisAlignedCuboid length', () => {
    const n = { x: 0, y: 1, z: 0 };
    for (let i = 0; i < 20; i++) {
      const a: [number, number, number] = [
        Math.floor(Math.random() * 8) - 4,
        1,
        Math.floor(Math.random() * 8) - 4
      ];
      const b: [number, number, number] = [
        Math.floor(Math.random() * 8) - 4,
        1,
        Math.floor(Math.random() * 8) - 4
      ];
      const depth = Math.floor(Math.random() * 6) - 2;
      const len = getAxisAlignedCuboid(a, b, n, depth, false, 1).length;
      expect(cuboidSolidVoxelCount(a, b, n, depth)).toBe(len);
    }
  });
});

describe('cuboidStrokeBounds', () => {
  it('matches brute-force AABB for random cuboids', () => {
    const n = { x: 0, y: 1, z: 0 };
    for (let i = 0; i < 25; i++) {
      const a: [number, number, number] = [
        Math.floor(Math.random() * 10) - 5,
        2,
        Math.floor(Math.random() * 10) - 5
      ];
      const b: [number, number, number] = [
        Math.floor(Math.random() * 10) - 5,
        2,
        Math.floor(Math.random() * 10) - 5
      ];
      const depth = Math.floor(Math.random() * 8) - 3;
      const brute = boundsFromPositions(getAxisAlignedCuboid(a, b, n, depth, false, 1));
      const analytic = cuboidStrokeBounds(a, b, n, depth);
      expect(analytic).toEqual(brute);
    }
  });
});

describe('lineStrokeBounds', () => {
  it('matches axis-aligned line voxels', () => {
    for (let i = 0; i < 20; i++) {
      const a: [number, number, number] = [
        Math.floor(Math.random() * 15) - 7,
        Math.floor(Math.random() * 15) - 7,
        Math.floor(Math.random() * 15) - 7
      ];
      const b: [number, number, number] = [
        Math.floor(Math.random() * 15) - 7,
        Math.floor(Math.random() * 15) - 7,
        Math.floor(Math.random() * 15) - 7
      ];
      const line = getAxisAlignedLine(a, b);
      const brute = boundsFromPositions(line);
      const analytic = lineStrokeBounds(a, b, false);
      expect(analytic).toEqual(brute);
    }
  });

  it('contains all Bresenham voxels for face-aligned line', () => {
    for (let i = 0; i < 25; i++) {
      const a: [number, number, number] = [
        Math.floor(Math.random() * 12) - 6,
        Math.floor(Math.random() * 12) - 6,
        Math.floor(Math.random() * 12) - 6
      ];
      const b: [number, number, number] = [
        Math.floor(Math.random() * 12) - 6,
        Math.floor(Math.random() * 12) - 6,
        Math.floor(Math.random() * 12) - 6
      ];
      const line = getBresenham3DLine(a, b);
      const analytic = lineStrokeBounds(a, b, true);
      expectBoundsContainAll(analytic, line);
      expect(analytic.minX).toBe(Math.min(a[0], b[0]));
      expect(analytic.maxX).toBe(Math.max(a[0], b[0]));
    }
  });
});

describe('expandStrokePreviewBoundsOriginMirror', () => {
  it('matches union of mirrored corner AABB', () => {
    const b = { minX: 1, maxX: 2, minY: 0, maxY: 0, minZ: -1, maxZ: 3 };
    const u = expandStrokePreviewBoundsOriginMirror(b, { x: true, y: false, z: false });
    expect(u.minX).toBe(-2);
    expect(u.maxX).toBe(2);
    expect(u).toMatchObject({ minY: 0, maxY: 0, minZ: -1, maxZ: 3 });
  });
});

describe('expandStrokePreviewBoundsAroundCenter', () => {
  it('mirrors box about center on Z', () => {
    const b = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 1, maxZ: 3 };
    const u = expandStrokePreviewBoundsAroundCenter(b, [0, 0, 0], { x: false, y: false, z: true });
    expect(u.minZ).toBe(-3);
    expect(u.maxZ).toBe(3);
  });
});

describe('inflateStrokePreviewBoundsForDrawBrush', () => {
  it('expands by margin for cube brush', () => {
    const b = { minX: 0, maxX: 1, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    const o = inflateStrokePreviewBoundsForDrawBrush(b, {
      drawBrushShape: 'cube',
      drawBrushSize: 1.5
    });
    expect(o.minX).toBe(-2);
    expect(o.maxX).toBe(3);
  });
});
