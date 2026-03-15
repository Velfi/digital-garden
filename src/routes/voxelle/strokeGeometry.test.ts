import { describe, it, expect } from 'vitest';
import {
  thickenPathForStroke,
  thickenPath,
  thickenPathTapered,
  getBresenham3DLine,
  getAxisAlignedLine,
  getAxisAlignedPlaneFromNormal,
  getAxisAlignedCuboid,
  getPolygonVoxels,
  getRayDirectionPath,
  getRopeCurveVoxels,
  applyBrushAlongPath
} from './strokeGeometry';

const defaultParams = {
  strokeMode: 'line',
  clayBrushRadius: 1,
  branchTaper: false,
  puffRadius: 1,
  puffScatter: 0,
  puffRadiusRange: false,
  puffRadiusMin: 0,
  puffRadiusMax: 2,
  airbrushRadius: 1,
  airbrushScatter: 0,
  airbrushRadiusRange: false,
  airbrushRadiusMin: 0,
  airbrushRadiusMax: 2
};

describe('thickenPathForStroke', () => {
  it('clay modes ignore stroke mode (e.g. airbrush) and use clay brush logic', () => {
    // Bug: stroke mode was checked before clay mode, so clay tools (melt, smooth, etc.)
    // incorrectly used airbrush spherical expansion when stroke mode was "airbrush".
    // Clay with brush radius 1 should use thickenPath (3x3 cube = 27 voxels per point),
    // not puffPath (sphere ≈ 7 voxels per point for r=1).
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const clayResult = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'airbrush',
      clayMode: 'melt',
      clayBrushRadius: 1
    });
    const expectedClayBrush = thickenPath(singlePoint, 1);
    expect(clayResult).toEqual(expectedClayBrush);
    expect(clayResult.length).toBe(27); // 3x3x3 cube, not sphere
  });

  it('stroke mode airbrush applies when not using clay', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const airbrushResult = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'airbrush',
      clayBrushRadius: 1
    });
    // Airbrush uses puffPath (sphere); r=1 gives 7 voxels (center + 6 face neighbors)
    expect(airbrushResult.length).toBe(7);
  });
});

describe('thickenPath', () => {
  it('radius 0 returns positions unchanged', () => {
    const path: [number, number, number][] = [[0, 0, 0], [1, 0, 0]];
    expect(thickenPath(path, 0)).toEqual(path);
  });

  it('radius 1 expands to 3x3x3 per point', () => {
    const path: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPath(path, 1);
    expect(result.length).toBe(27);
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([1, 1, 1]);
    expect(result).toContainEqual([-1, -1, -1]);
  });
});

describe('thickenPathTapered', () => {
  it('empty path returns empty', () => {
    expect(thickenPathTapered([], 1, 0)).toEqual([]);
  });

  it('single point with baseRadius 1 produces cube', () => {
    const result = thickenPathTapered([[0, 0, 0]], 1, 0);
    expect(result.length).toBe(27);
  });
});

describe('getBresenham3DLine', () => {
  it('returns endpoints for same point', () => {
    const result = getBresenham3DLine([0, 0, 0], [0, 0, 0]);
    expect(result).toEqual([[0, 0, 0]]);
  });

  it('returns straight line along X axis', () => {
    const result = getBresenham3DLine([0, 0, 0], [3, 0, 0]);
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([3, 0, 0]);
    expect(result.length).toBe(4);
  });
});

describe('getAxisAlignedLine', () => {
  it('along X: varies only x', () => {
    const result = getAxisAlignedLine([0, 1, 2], [3, 1, 2]);
    expect(result).toEqual([[0, 1, 2], [1, 1, 2], [2, 1, 2], [3, 1, 2]]);
  });

  it('along Y: varies only y', () => {
    const result = getAxisAlignedLine([0, 0, 0], [0, 2, 0]);
    expect(result).toEqual([[0, 0, 0], [0, 1, 0], [0, 2, 0]]);
  });

  it('along Z: varies only z', () => {
    const result = getAxisAlignedLine([0, 0, 0], [0, 0, -2]);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([0, 0, -1]);
    expect(result).toContainEqual([0, 0, -2]);
  });
});

describe('getAxisAlignedPlaneFromNormal', () => {
  it('+X normal gives constant-x plane', () => {
    const result = getAxisAlignedPlaneFromNormal([2, 0, 0], [2, 1, 1], { x: 1, y: 0, z: 0 });
    expect(result.every(([x]) => x === 2)).toBe(true);
    expect(result.length).toBe(4); // 2×2 plane
  });

  it('+Y normal gives constant-y plane', () => {
    const result = getAxisAlignedPlaneFromNormal([0, 3, 0], [1, 3, 1], { x: 0, y: 1, z: 0 });
    expect(result.every(([, y]) => y === 3)).toBe(true);
  });
});

describe('getAxisAlignedCuboid', () => {
  it('depth 0 returns plane', () => {
    const plane = getAxisAlignedPlaneFromNormal([0, 0, 0], [1, 1, 0], { x: 0, y: 0, z: 1 });
    const cuboid = getAxisAlignedCuboid([0, 0, 0], [1, 1, 0], { x: 0, y: 0, z: 1 }, 0);
    expect(cuboid).toEqual(plane);
  });

  it('depth 1 extends plane by one layer', () => {
    const result = getAxisAlignedCuboid([0, 0, 0], [0, 0, 0], { x: 0, y: 0, z: 1 }, 1);
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([0, 0, 1]);
    expect(result.length).toBe(2);
  });
});

describe('getPolygonVoxels', () => {
  it('empty returns empty', () => {
    expect(getPolygonVoxels([])).toEqual([]);
  });

  it('single point returns that point', () => {
    expect(getPolygonVoxels([[1, 2, 3]])).toEqual([[1, 2, 3]]);
  });

  it('two points returns line', () => {
    const result = getPolygonVoxels([[0, 0, 0], [2, 0, 0]]);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([2, 0, 0]);
  });
});

describe('getRopeCurveVoxels', () => {
  const a: [number, number, number] = [0, 10, 0];
  const b: [number, number, number] = [20, 10, 0];

  it('tension 1 produces a nearly straight line', () => {
    const result = getRopeCurveVoxels(a, b, 1);
    const minY = Math.min(...result.map(([, y]) => y));
    const maxY = Math.max(...result.map(([, y]) => y));
    expect(maxY - minY).toBeLessThanOrEqual(1);
  });

  it('tension 0 produces visible sag below endpoints', () => {
    const result = getRopeCurveVoxels(a, b, 0);
    const minY = Math.min(...result.map(([, y]) => y));
    // Should sag well below y=10 (the endpoint height)
    expect(minY).toBeLessThan(5);
  });

  it('lower tension produces more sag than higher tension', () => {
    const loose = getRopeCurveVoxels(a, b, 0.2);
    const tight = getRopeCurveVoxels(a, b, 0.8);
    const looseMinY = Math.min(...loose.map(([, y]) => y));
    const tightMinY = Math.min(...tight.map(([, y]) => y));
    expect(looseMinY).toBeLessThan(tightMinY);
  });

  it('tension 0.5 produces moderate sag', () => {
    const result = getRopeCurveVoxels(a, b, 0.5);
    const minY = Math.min(...result.map(([, y]) => y));
    expect(minY).toBeLessThan(10);
    expect(minY).toBeGreaterThan(-20);
  });

  it('same point returns single voxel', () => {
    expect(getRopeCurveVoxels([5, 5, 5], [5, 5, 5], 0.5)).toEqual([[5, 5, 5]]);
  });

  it('vertical chord falls back to straight line', () => {
    const result = getRopeCurveVoxels([0, 0, 0], [0, 10, 0], 0.5);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.every(([x, , z]) => x === 0 && z === 0)).toBe(true);
  });

  it('includes both endpoints', () => {
    const result = getRopeCurveVoxels(a, b, 0.5);
    expect(result).toContainEqual([0, 10, 0]);
    expect(result).toContainEqual([20, 10, 0]);
  });

  it('3D diagonal chord works', () => {
    const result = getRopeCurveVoxels([0, 10, 0], [10, 10, 10], 0.3);
    const minY = Math.min(...result.map(([, y]) => y));
    expect(minY).toBeLessThan(10);
    expect(result.length).toBeGreaterThan(5);
  });
});

describe('applyBrushAlongPath', () => {
  it('sphere brush expands path', () => {
    const path: [number, number, number][] = [[0, 0, 0]];
    const result = applyBrushAlongPath(path, 'sphere', 1);
    expect(result.length).toBe(7); // sphere r=1
  });

  it('cube brush expands path', () => {
    const path: [number, number, number][] = [[0, 0, 0]];
    const result = applyBrushAlongPath(path, 'cube', 1);
    expect(result.length).toBe(27); // 3x3x3
  });

  it('radius 0 returns original path', () => {
    const path: [number, number, number][] = [[0, 0, 0], [1, 0, 0]];
    expect(applyBrushAlongPath(path, 'sphere', 0)).toEqual(path);
    expect(applyBrushAlongPath(path, 'cube', 0)).toEqual(path);
  });
});

describe('getRayDirectionPath', () => {
  it('length 0 returns origin only', () => {
    expect(getRayDirectionPath([0, 0, 0], { x: 1, y: 0, z: 0 }, 0)).toEqual([[0, 0, 0]]);
  });

  it('length 1 along X gives two points', () => {
    const result = getRayDirectionPath([0, 0, 0], { x: 1, y: 0, z: 0 }, 1);
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([1, 0, 0]);
  });
});
