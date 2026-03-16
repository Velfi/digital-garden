import { describe, it, expect } from 'vitest';
import {
  thickenPathForStroke,
  thickenPath,
  thickenPathTapered,
  puffPath,
  createSeededRng,
  getBresenham3DLine,
  getAxisAlignedLine,
  projectPointOntoPlane,
  getAxisAlignedPlaneFromNormal,
  getAxisAlignedCuboid,
  getPolygonVoxels,
  getRayDirectionPath,
  getRopeCurveVoxels,
  applyBrushAlongPath,
  getSprayDirectionVector
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

  it('airbrush constrain to plane keeps voxels on plane through first point', () => {
    const path: [number, number, number][] = [[1, 2, 3]];
    const unconstrained = thickenPathForStroke(path, {
      ...defaultParams,
      strokeMode: 'airbrush',
      airbrushRadius: 1
    });
    expect(unconstrained.length).toBe(7);
    const constrainedY = thickenPathForStroke(path, {
      ...defaultParams,
      strokeMode: 'airbrush',
      airbrushRadius: 1,
      airbrushConstrainToPlane: true,
      planeAxis: 1
    });
    expect(constrainedY.length).toBeLessThanOrEqual(7);
    constrainedY.forEach(([x, y, z]) => expect(y).toBe(2));
    const constrainedX = thickenPathForStroke(path, {
      ...defaultParams,
      strokeMode: 'airbrush',
      airbrushRadius: 1,
      airbrushConstrainToPlane: true,
      planeAxis: 0
    });
    constrainedX.forEach(([x, y, z]) => expect(x).toBe(1));
  });

  // Regression: switching to Clay after using a selection method (line, plane, airbrush, etc.)
  // must use clay brush, not the previous selection method. Callers must pass clayMode when tool is clay.
  it('clay mode with selection method line uses clay brush not draw brush', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'line',
      drawBrushSize: 2,
      clayMode: 'bulk',
      clayBrushRadius: 1
    });
    const expectedClayBrush = thickenPath(singlePoint, 1);
    expect(result).toEqual(expectedClayBrush);
    expect(result.length).toBe(27); // 3x3x3 clay brush, not draw brush (2) or raw line
  });

  it('without clayMode, selection method determines behavior (callers must pass clayMode when in clay)', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const withAirbrush = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'airbrush',
      clayBrushRadius: 1
      // clayMode intentionally omitted
    });
    expect(withAirbrush.length).toBe(7); // airbrush sphere
    const withClay = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'airbrush',
      clayBrushRadius: 1,
      clayMode: 'melt'
    });
    expect(withClay.length).toBe(27); // clay brush
  });

  it('clay wall with direction and wallHeight adds voxels along direction', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'line',
      clayMode: 'wall',
      clayBrushRadius: 0,
      sprayDirection: 'down',
      wallHeight: 3
    });
    // Path (0,0,0) + streak down: (0,-1,0), (0,-2,0), (0,-3,0) = 4 total
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([0, -1, 0]);
    expect(result).toContainEqual([0, -2, 0]);
    expect(result).toContainEqual([0, -3, 0]);
    expect(result.length).toBe(4);
  });

  it('clay wall with direction auto uses wallFaceNormal', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'line',
      clayMode: 'wall',
      clayBrushRadius: 0,
      sprayDirection: 'auto',
      wallFaceNormal: { x: 0, y: -1, z: 0 },
      wallHeight: 2
    });
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([0, -1, 0]);
    expect(result).toContainEqual([0, -2, 0]);
    expect(result.length).toBe(3);
  });

  it('clay wall with spray direction none returns path only', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'line',
      clayMode: 'wall',
      clayBrushRadius: 0,
      sprayDirection: 'none',
      wallHeight: 5
    });
    expect(result).toEqual([[0, 0, 0]]);
  });

  it('clay wall with wallWidth 1 gives 2 voxels thick (path + perpendicular)', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'line',
      clayMode: 'wall',
      clayBrushRadius: 0,
      sprayDirection: 'down',
      wallWidth: 1,
      wallHeight: 2
    });
    // Base = (0,0,0) + (1,0,0) perpendicular; each extends down 2 => 2*3 = 6 voxels
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([1, 0, 0]);
    expect(result).toContainEqual([0, -1, 0]);
    expect(result).toContainEqual([0, -2, 0]);
    expect(result.length).toBeGreaterThanOrEqual(4);
  });

  it('clay wall with wallWidth 2 thickens in plane only (width does not affect height)', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'line',
      clayMode: 'wall',
      clayBrushRadius: 0,
      sprayDirection: 'down',
      wallWidth: 2,
      wallHeight: 2
    });
    // Base = 3×3 in XZ plane (9 voxels), each extends down 2 → 9 * 3 = 27
    expect(result.length).toBe(27);
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([0, -1, 0]);
    expect(result).toContainEqual([0, -2, 0]);
  });
});

describe('puffPath with seeded RNG', () => {
  it('same seed and path produce identical output', () => {
    const positions: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [2, 1, 0]];
    const seed = 12345;
    const rng = createSeededRng(seed);
    const a = puffPath(positions, 1, 2, undefined, undefined, rng);
    const rng2 = createSeededRng(seed);
    const b = puffPath(positions, 1, 2, undefined, undefined, rng2);
    expect(a).toEqual(b);
  });

  it('different seeds produce different output when scatter > 0', () => {
    const positions: [number, number, number][] = [[0, 0, 0], [1, 0, 0]];
    const out1 = puffPath(positions, 1, 2, undefined, undefined, createSeededRng(1));
    const out2 = puffPath(positions, 1, 2, undefined, undefined, createSeededRng(2));
    expect(out1).not.toEqual(out2);
  });
});

describe('getSprayDirectionVector', () => {
  it('returns null for none and auto without normal', () => {
    expect(getSprayDirectionVector('none')).toBeNull();
    expect(getSprayDirectionVector('auto')).toBeNull();
  });
  it('returns snapped axis for auto with face normal', () => {
    expect(getSprayDirectionVector('auto', { x: 0, y: -1, z: 0 })).toEqual([0, -1, 0]);
    expect(getSprayDirectionVector('auto', { x: 0.9, y: 0.1, z: 0 })).toEqual([1, 0, 0]);
  });
  it('returns world-axis vectors for named directions', () => {
    expect(getSprayDirectionVector('down')).toEqual([0, -1, 0]);
    expect(getSprayDirectionVector('up')).toEqual([0, 1, 0]);
    expect(getSprayDirectionVector('forward')).toEqual([0, 0, -1]);
    expect(getSprayDirectionVector('back')).toEqual([0, 0, 1]);
    expect(getSprayDirectionVector('left')).toEqual([-1, 0, 0]);
    expect(getSprayDirectionVector('right')).toEqual([1, 0, 0]);
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

describe('projectPointOntoPlane', () => {
  it('point on plane is unchanged', () => {
    const planePoint: [number, number, number] = [0, 0, 0];
    const normal = { x: 0, y: 1, z: 0 };
    const pointOnPlane: [number, number, number] = [3, 0, 5];
    const result = projectPointOntoPlane(pointOnPlane, planePoint, normal);
    expect(result).toEqual([3, 0, 5]);
  });

  it('point off plane projects to plane', () => {
    const planePoint: [number, number, number] = [0, 0, 0];
    const normal = { x: 0, y: 1, z: 0 };
    const pointOffPlane: [number, number, number] = [2, 4, 3];
    const result = projectPointOntoPlane(pointOffPlane, planePoint, normal);
    expect(result).toEqual([2, 0, 3]);
  });

  it('projects onto tilted plane', () => {
    const planePoint: [number, number, number] = [0, 0, 0];
    const len = Math.sqrt(2);
    const n = { x: 1 / len, y: 1 / len, z: 0 };
    const point: [number, number, number] = [5, 5, 2];
    const result = projectPointOntoPlane(point, planePoint, n);
    expect(result).toEqual([0, 0, 2]);
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
