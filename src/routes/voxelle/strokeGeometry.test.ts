import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  thickenPathForStroke,
  thickenPath,
  thickenPathTapered,
  expandPathWithBrushStamps,
  createSeededRng,
  getBresenham3DLine,
  getAxisAlignedLine,
  projectPointOntoPlane,
  getAxisAlignedPlaneFromNormal,
  getAxisAlignedCircleFromNormal,
  getAxisAlignedCylinder,
  getAxisAlignedCuboid,
  getPolygonVoxels,
  getPolygonClosedOutlineVoxels,
  getSolidPolygonBasePositions,
  getSolidPolygonStrokeVoxels,
  getRayDirectionPath,
  resolveBranchExtrudeDirection,
  getRopeCurveVoxels,
  getClothPatchFromPinsVoxels,
  applyBrushAlongPath,
  getSprayDirectionVector,
  mergeSphereStampIntoSeen,
  mergeCubeStampIntoSeen,
  mergePyramidStampIntoSeen,
  pyramidPath
} from './strokeGeometry';
import type { StrokeMode } from './store/core';

const defaultParams = {
  strokeMode: 'line' as StrokeMode,
  sculptBrushRadius: 1,
  branchTaper: false,
  sprayRadius: 1,
  sprayScatter: 0,
  sprayRadiusRange: false,
  sprayRadiusMin: 0,
  sprayRadiusMax: 2
};

describe('thickenPathForStroke', () => {
  it('sculpt path modes ignore stroke mode (e.g. spray) and use sculpt brush logic', () => {
    // Bug: stroke mode was checked before sculpt mode, so sculpt tools (smooth, draw, etc.)
    // incorrectly used Spray spherical expansion when strokeMode was still set to spray.
    // Smooth/draw use surface-plane thickening: default Y layer, cube r=1 => 3×3.
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const clayResult = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'spray',
      sculptMode: 'smooth',
      sculptBrushRadius: 1
    });
    expect(clayResult.length).toBe(9);
    expect(new Set(clayResult.map(([, y]) => y)).size).toBe(1);
  });

  it('stroke mode spray applies when not using clay', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const sprayResult = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'spray',
      sculptBrushRadius: 1
    });
    // Spray sphere: expandPathWithBrushStamps(..., 'sphere'); r=1 gives 7 voxels (center + 6 face neighbors)
    expect(sprayResult.length).toBe(7);
  });

  it('spray snap to surface offsets droplet center along face normal', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const unsnapped = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'spray',
      sculptBrushRadius: 1,
      sprayRadius: 1,
      spraySnapToSurface: false,
      drawBrushFaceNormal: { x: 1, y: 0, z: 0 }
    });
    const snapped = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'spray',
      sculptBrushRadius: 1,
      sprayRadius: 1,
      spraySnapToSurface: true,
      drawBrushFaceNormal: { x: 1, y: 0, z: 0 }
    });
    expect(unsnapped.length).toBe(7);
    expect(snapped.length).toBe(7);
    expect(sortPositionKeys(snapped)).toEqual(
      sortPositionKeys(unsnapped.map(([x, y, z]) => [x + 1, y, z] as [number, number, number]))
    );
  });

  it('spray cube mode uses Chebyshev cube per droplet', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const cubeAir = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'spray',
      sculptBrushRadius: 1,
      sprayBrushShape: 'cube',
      sprayRadius: 1
    });
    expect(cubeAir.length).toBe(27); // same as thickenPath(singlePoint, 1)
  });

  it('spray pyramid mode matches draw pyramidPath per droplet', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const expected = pyramidPath(singlePoint, 1);
    const pyramidAir = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'spray',
      sculptBrushRadius: 1,
      sprayBrushShape: 'pyramid',
      sprayRadius: 1
    });
    expect(sortPositionKeys(pyramidAir)).toEqual(sortPositionKeys(expected));
  });

  it('spray constrain to plane does not flatten brush shape (path is constrained in canvas)', () => {
    const path: [number, number, number][] = [[1, 2, 3]];
    const unconstrained = thickenPathForStroke(path, {
      ...defaultParams,
      strokeMode: 'spray',
      sprayRadius: 1
    });
    expect(unconstrained.length).toBe(7);
    // With constrain to plane, brush shape stays spherical; only path is constrained (in VoxelCanvas).
    const constrainedY = thickenPathForStroke(path, {
      ...defaultParams,
      strokeMode: 'spray',
      sprayRadius: 1,
      sprayConstrainToPlane: true,
      planeAxis: 1
    });
    expect(constrainedY.length).toBe(7);
    const ys = constrainedY.map(([, y]) => y);
    expect(new Set(ys).size).toBeGreaterThan(1); // sphere has voxels off the plane
    const constrainedX = thickenPathForStroke(path, {
      ...defaultParams,
      strokeMode: 'spray',
      sprayRadius: 1,
      sprayConstrainToPlane: true,
      planeAxis: 0
    });
    expect(constrainedX.length).toBe(7);
    const xs = constrainedX.map(([x]) => x);
    expect(new Set(xs).size).toBeGreaterThan(1);
  });

  // Regression: switching to Clay after using a selection method (line, plane, spray, etc.)
  // must use clay brush, not the previous selection method. Callers must pass clayMode when tool is clay.
  it('clay mode with selection method line uses clay brush not draw brush', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'line',
      drawBrushSize: 2,
      sculptMode: 'draw',
      sculptBrushRadius: 1
    });
    // Bulk: single layer in XZ when no face normal (default Y axis) => 3×3
    expect(result.length).toBe(9);
    expect(new Set(result.map(([, y]) => y)).size).toBe(1);
  });

  it('draw sculpt circle: flat disk in layer plane', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      sculptMode: 'draw',
      sculptBrushRadius: 1,
      sculptBrushShape: 'circle'
    });
    expect(result.length).toBe(5);
    expect(new Set(result.map(([, y]) => y)).size).toBe(1);
  });

  it('draw sculpt square with face normal keeps layer in plane perpendicular to normal', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      sculptMode: 'draw',
      sculptBrushRadius: 1,
      sculptBrushShape: 'square',
      drawBrushFaceNormal: { x: 0, y: 1, z: 0 }
    });
    expect(result.length).toBe(9);
    for (const [, y] of result) {
      expect(y).toBe(0);
    }
  });

  it('draw sculpt circle with face normal stays in that plane', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      sculptMode: 'draw',
      sculptBrushRadius: 1,
      sculptBrushShape: 'circle',
      drawBrushFaceNormal: { x: 0, y: 1, z: 0 }
    });
    expect(result.length).toBe(5);
    for (const [, y] of result) {
      expect(y).toBe(0);
    }
  });

  it('draw sculpt cube: 3D Chebyshev ball per path point', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      sculptMode: 'draw',
      sculptBrushRadius: 1,
      sculptBrushShape: 'cube'
    });
    expect(result).toEqual(thickenPath(singlePoint, 1));
    expect(result.length).toBe(27);
  });

  it('draw sculpt sphere: 3D Euclidean ball per path point', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      sculptMode: 'draw',
      sculptBrushRadius: 1,
      sculptBrushShape: 'sphere'
    });
    expect(result).toEqual(expandPathWithBrushStamps(singlePoint, 'sphere', 1, 0));
    expect(result.length).toBe(7);
  });

  it('without clayMode, selection method determines behavior (callers must pass clayMode when in clay)', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const withSpray = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'spray',
      sculptBrushRadius: 1
      // clayMode intentionally omitted
    });
    expect(withSpray.length).toBe(7); // spray sphere
    const withClay = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'spray',
      sculptBrushRadius: 1,
      sculptMode: 'smooth'
    });
    expect(withClay.length).toBe(9); // smooth: in-plane cube brush
  });

  it('smooth with clay circle matches draw circle thickening', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      sculptMode: 'smooth',
      sculptBrushRadius: 1,
      sculptBrushShape: 'circle'
    });
    expect(result.length).toBe(5);
    expect(new Set(result.map(([, y]) => y)).size).toBe(1);
  });

  it('gouge with sculpt circle matches disk in layer plane', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      sculptMode: 'gouge',
      sculptBrushRadius: 1,
      sculptBrushShape: 'circle'
    });
    expect(result.length).toBe(5);
  });

  it('gouge with clay circle matches draw circle thickening', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const drawFootprint = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      sculptMode: 'draw',
      sculptBrushRadius: 1,
      sculptBrushShape: 'circle'
    });
    const gouge = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      sculptMode: 'gouge',
      sculptBrushRadius: 1,
      sculptBrushShape: 'circle'
    });
    expect(gouge.length).toBe(drawFootprint.length);
    expect(new Set(gouge.map((p) => p.join(',')))).toEqual(new Set(drawFootprint.map((p) => p.join(','))));
  });

  it('clay wall with direction and wallHeight adds voxels along direction', () => {
    const singlePoint: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPathForStroke(singlePoint, {
      ...defaultParams,
      strokeMode: 'line',
      sculptMode: 'wall',
      sculptBrushRadius: 0,
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
      sculptMode: 'wall',
      sculptBrushRadius: 0,
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
      sculptMode: 'wall',
      sculptBrushRadius: 0,
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
      sculptMode: 'wall',
      sculptBrushRadius: 0,
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
      sculptMode: 'wall',
      sculptBrushRadius: 0,
      sprayDirection: 'down',
      wallWidth: 2,
      wallHeight: 2
    });
    // width=2 maps to radius 0.5 => 2x2 base in XZ (4 voxels), each extends down 2 => 4 * 3 = 12
    expect(result.length).toBe(12);
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([0, -1, 0]);
    expect(result).toContainEqual([0, -2, 0]);
  });
});

describe('expandPathWithBrushStamps (sphere) with seeded RNG', () => {
  it('same seed and path produce identical output', () => {
    const positions: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 1, 0]
    ];
    const seed = 12345;
    const rng = createSeededRng(seed);
    const a = expandPathWithBrushStamps(positions, 'sphere', 1, 2, undefined, undefined, rng);
    const rng2 = createSeededRng(seed);
    const b = expandPathWithBrushStamps(positions, 'sphere', 1, 2, undefined, undefined, rng2);
    expect(a).toEqual(b);
  });

  it('different seeds produce different output when scatter > 0', () => {
    const positions: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0]
    ];
    const out1 = expandPathWithBrushStamps(positions, 'sphere', 1, 2, undefined, undefined, createSeededRng(1));
    const out2 = expandPathWithBrushStamps(positions, 'sphere', 1, 2, undefined, undefined, createSeededRng(2));
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
    const path: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0]
    ];
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

  it('radius 0.5 expands to 2x2x2 per point', () => {
    const path: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPath(path, 0.5);
    expect(result.length).toBe(8);
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([-1, -1, -1]);
  });

  it('radius 1.5 expands to 4x4x4 per point', () => {
    const path: [number, number, number][] = [[0, 0, 0]];
    const result = thickenPath(path, 1.5);
    expect(result.length).toBe(64);
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([-2, -2, -2]);
    expect(result).toContainEqual([1, 1, 1]);
  });
});

describe('thickenPathTapered', () => {
  it('empty path returns empty', () => {
    expect(thickenPathTapered([], 1, 0)).toEqual([]);
  });

  it('single point with baseRadius 1 produces a 3x3x3 taper step', () => {
    const result = thickenPathTapered([[0, 0, 0]], 1, 0);
    expect(result.length).toBe(27);
  });
});

describe('clay branch cylinder brush', () => {
  const branchBase = {
    ...defaultParams,
    sculptMode: 'branch' as const,
    sculptBrushRadius: 1,
    branchTaper: false,
    branchBrushProfile: 'cylinder' as const,
    branchEndCap: 'flat' as const
  };

  it('cylinder flat cross-section is rounder than axis-aligned cube along X', () => {
    const path: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0]
    ];
    const cyl = thickenPathForStroke(path, branchBase);
    const cube = thickenPathForStroke(path, {
      ...branchBase,
      branchBrushProfile: 'cube'
    });
    const sliceCyl = cyl.filter(([x, y, z]) => x === 1 && z === 0).map((p) => p[1]);
    const sliceCube = cube.filter(([x, y, z]) => x === 1 && z === 0).map((p) => p[1]);
    const spread = (ys: number[]) => new Set(ys).size;
    expect(spread(sliceCyl)).toBeLessThanOrEqual(spread(sliceCube));
    expect(cyl.length).toBeLessThan(cube.length);
  });

  it('pointed caps extend past the last centerline voxel along +X', () => {
    const path: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0]
    ];
    const flat = thickenPathForStroke(path, branchBase);
    const pointed = thickenPathForStroke(path, { ...branchBase, branchEndCap: 'pointed' });
    const maxXFlat = Math.max(...flat.map((p) => p[0]));
    const maxXPointed = Math.max(...pointed.map((p) => p[0]));
    expect(maxXPointed).toBeGreaterThan(maxXFlat);
  });

  it('rounded (capsule) volume is at least as large as flat cylinder', () => {
    const path: [number, number, number][] = [
      [0, 0, 0],
      [2, 0, 0]
    ];
    const flat = thickenPathForStroke(path, branchBase);
    const rounded = thickenPathForStroke(path, { ...branchBase, branchEndCap: 'rounded' });
    expect(rounded.length).toBeGreaterThanOrEqual(flat.length);
  });

  it('taper cylinder has wider cross-section at base than near tip', () => {
    const path: [number, number, number][] = [];
    for (let i = 0; i <= 6; i++) path.push([i, 0, 0]);
    const result = thickenPathForStroke(path, {
      ...defaultParams,
      sculptMode: 'branch',
      sculptBrushRadius: 1,
      branchTaper: true,
      branchTaperStartRadius: 2,
      branchTaperEndRadius: 0,
      branchBrushProfile: 'cylinder',
      branchEndCap: 'flat'
    });
    const spread = (pts: [number, number, number][]) =>
      new Set(pts.map((p) => `${p[1]},${p[2]}`)).size;
    const atStart = result.filter(([x]) => x === 0);
    const atMid = result.filter(([x]) => x === 3);
    expect(spread(atStart)).toBeGreaterThan(spread(atMid));
  });

  it('branch taper with cube profile still uses thickenPathTapered', () => {
    const path: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0]
    ];
    const cube = thickenPathForStroke(path, {
      ...defaultParams,
      sculptMode: 'branch',
      sculptBrushRadius: 1,
      branchTaper: true,
      branchTaperStartRadius: 1,
      branchTaperEndRadius: 0,
      branchBrushProfile: 'cube'
    });
    const expected = thickenPathTapered(path, 1, 0);
    expect(cube.length).toBe(expected.length);
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
    expect(result).toEqual([
      [0, 1, 2],
      [1, 1, 2],
      [2, 1, 2],
      [3, 1, 2]
    ]);
  });

  it('along Y: varies only y', () => {
    const result = getAxisAlignedLine([0, 0, 0], [0, 2, 0]);
    expect(result).toEqual([
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0]
    ]);
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

  it('hollow true returns only perimeter', () => {
    const result = getAxisAlignedPlaneFromNormal([0, 1, 0], [2, 1, 2], { x: 0, y: 1, z: 0 }, true);
    expect(result.length).toBe(8);
    expect(result.every(([, y]) => y === 1)).toBe(true);
    const xz = new Set(result.map(([x, , z]) => `${x},${z}`));
    expect(xz.has('0,0')).toBe(true);
    expect(xz.has('1,0')).toBe(true);
    expect(xz.has('2,0')).toBe(true);
    expect(xz.has('0,1')).toBe(true);
    expect(xz.has('2,1')).toBe(true);
    expect(xz.has('0,2')).toBe(true);
    expect(xz.has('1,2')).toBe(true);
    expect(xz.has('2,2')).toBe(true);
    expect(xz.has('1,1')).toBe(false);
  });

  it('hollow 2×2 plane returns all 4 voxels', () => {
    const result = getAxisAlignedPlaneFromNormal([0, 0, 0], [1, 0, 1], { x: 0, y: 1, z: 0 }, true);
    expect(result.length).toBe(4);
  });

  it('hollow 1D plane segment returns no duplicates', () => {
    const result = getAxisAlignedPlaneFromNormal([0, 0, 0], [2, 0, 0], { x: 0, y: 1, z: 0 }, true);
    expect(result.length).toBe(3);
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([1, 0, 0]);
    expect(result).toContainEqual([2, 0, 0]);
    expect(new Set(result.map((p) => p.join(','))).size).toBe(3);
  });

  it('hollow wall thickness 2 on 5×5 plane removes only center voxel', () => {
    const result = getAxisAlignedPlaneFromNormal(
      [0, 0, 0],
      [4, 0, 4],
      { x: 0, y: 1, z: 0 },
      true,
      2
    );
    expect(result.length).toBe(24);
    expect(result.some(([x, , z]) => x === 2 && z === 2)).toBe(false);
  });
});

describe('getAxisAlignedCircleFromNormal', () => {
  it('zero radius returns single voxel', () => {
    expect(getAxisAlignedCircleFromNormal([1, 2, 3], [1, 2, 3], { x: 0, y: 1, z: 0 })).toEqual([
      [1, 2, 3]
    ]);
  });

  it('+Y normal: disk in XZ through center', () => {
    const result = getAxisAlignedCircleFromNormal([5, 0, 5], [5, 0, 6], { x: 0, y: 1, z: 0 });
    expect(result.every(([, y]) => y === 0)).toBe(true);
    expect(result.length).toBe(5);
    expect(result).toContainEqual([5, 0, 5]);
    expect(result).toContainEqual([5, 0, 6]);
    expect(result).toContainEqual([5, 0, 4]);
    expect(result).toContainEqual([4, 0, 5]);
    expect(result).toContainEqual([6, 0, 5]);
  });

  it('hollow omits strictly interior voxels', () => {
    const filled = getAxisAlignedCircleFromNormal(
      [0, 1, 0],
      [2, 1, 0],
      { x: 0, y: 1, z: 0 },
      false
    );
    const hollow = getAxisAlignedCircleFromNormal([0, 1, 0], [2, 1, 0], { x: 0, y: 1, z: 0 }, true);
    expect(hollow.length).toBeLessThan(filled.length);
    expect(
      hollow.every((p) => filled.some((q) => q[0] === p[0] && q[1] === p[1] && q[2] === p[2]))
    ).toBe(true);
    expect(hollow).not.toContainEqual([0, 1, 0]);
    expect(hollow).toContainEqual([-2, 1, 0]);
    expect(hollow).toContainEqual([2, 1, 0]);
    expect(hollow).not.toContainEqual([1, 1, 0]);
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

  it('hollow true returns only shell', () => {
    const result = getAxisAlignedCuboid([0, 0, 0], [2, 2, 0], { x: 0, y: 0, z: 1 }, 2, true);
    expect(result).not.toContainEqual([1, 1, 1]);
    result.forEach(([x, y, z]) => {
      const onBoundary = x === 0 || x === 2 || y === 0 || y === 2 || z === 0 || z === 2;
      expect(onBoundary).toBe(true);
    });
  });

  it('hollow depth 0 equals hollow plane', () => {
    const plane = getAxisAlignedPlaneFromNormal([0, 0, 0], [2, 2, 0], { x: 0, y: 0, z: 1 }, true);
    const cuboid = getAxisAlignedCuboid([0, 0, 0], [2, 2, 0], { x: 0, y: 0, z: 1 }, 0, true);
    expect(cuboid).toEqual(plane);
  });
});

describe('getAxisAlignedCylinder', () => {
  const nZ = { x: 0, y: 0, z: 1 };
  const center: [number, number, number] = [0, 0, 0];
  const edge: [number, number, number] = [2, 0, 0];

  it('depth 0 matches circle in plane', () => {
    const circle = getAxisAlignedCircleFromNormal(center, edge, nZ);
    const cyl = getAxisAlignedCylinder(center, edge, nZ, 0, 0);
    expect(cyl).toEqual(circle);
  });

  it('cylinder depth 1 is two full disks along Z', () => {
    const d0 = getAxisAlignedCircleFromNormal(center, edge, nZ);
    const d1 = d0.map(([x, y, z]) => [x, y, z + 1] as [number, number, number]);
    const merged = [...d0, ...d1];
    const seen = new Set(merged.map((p) => `${p[0]},${p[1]},${p[2]}`));
    const cyl = getAxisAlignedCylinder(center, edge, nZ, 1, 0);
    expect(cyl.length).toBe(seen.size);
    for (const p of cyl) {
      expect(seen.has(`${p[0]},${p[1]},${p[2]}`)).toBe(true);
    }
  });

  it('cone depth 1 adds only axis tip on second layer', () => {
    const cyl = getAxisAlignedCylinder(center, edge, nZ, 1, 100);
    const onTipZ = cyl.filter((p) => p[2] === 1);
    expect(onTipZ).toEqual([[0, 0, 1]]);
    expect(cyl.length).toBeLessThan(
      getAxisAlignedCylinder(center, edge, nZ, 1, 0).length
    );
  });

  it('50% taper keeps wider tip than full cone for depth 1', () => {
    const full = getAxisAlignedCylinder(center, edge, nZ, 1, 100);
    const half = getAxisAlignedCylinder(center, edge, nZ, 1, 50);
    expect(half.length).toBeGreaterThan(full.length);
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
    const result = getPolygonVoxels([
      [0, 0, 0],
      [2, 0, 0]
    ]);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual([0, 0, 0]);
    expect(result).toContainEqual([2, 0, 0]);
  });

  it('three points at different elevations produce a single layer on the plane, not a stair/slab', () => {
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [2, 0, 0];
    const c: [number, number, number] = [1, 1, 1];
    const result = getPolygonVoxels([a, b, c]);
    // Plane n·p + d = 0 through a,b,c: n = (b-a)×(c-a), d = -n·a (n normalized)
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = ab[1] * ac[2] - ab[2] * ac[1];
    const ny = ab[2] * ac[0] - ab[0] * ac[2];
    const nz = ab[0] * ac[1] - ab[1] * ac[0];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const n = [nx / len, ny / len, nz / len];
    const d = -(n[0] * a[0] + n[1] * a[1] + n[2] * a[2]);
    for (const p of result) {
      const dist = Math.abs(n[0] * p[0] + n[1] * p[1] + n[2] * p[2] + d);
      expect(dist).toBeLessThan(1); // voxel corners can sit up to ~0.7 from plane
    }
    // Slab bug would fill many voxels (full column per (u,v)); thin triangle should be small
    expect(result.length).toBeLessThanOrEqual(10);
  });
});

describe('getPolygonClosedOutlineVoxels', () => {
  it('empty and single point', () => {
    expect(getPolygonClosedOutlineVoxels([])).toEqual([]);
    expect(getPolygonClosedOutlineVoxels([[1, 2, 3]])).toEqual([[1, 2, 3]]);
  });

  it('two points: open segment only (no duplicate return)', () => {
    const r = getPolygonClosedOutlineVoxels([
      [0, 0, 0],
      [2, 0, 0]
    ]);
    expect(r).toHaveLength(3);
  });

  it('square: outline is smaller than fill', () => {
    const corners: [number, number, number][] = [
      [0, 0, 0],
      [2, 0, 0],
      [2, 0, 2],
      [0, 0, 2]
    ];
    const outline = getPolygonClosedOutlineVoxels(corners);
    const fill = getPolygonVoxels(corners);
    expect(outline.length).toBeLessThan(fill.length);
    expect(outline.length).toBeGreaterThan(0);
  });
});

const nY = { x: 0, y: 1, z: 0 };

describe('getSolidPolygonBasePositions', () => {
  it('returns null for fewer than 2 points', () => {
    expect(getSolidPolygonBasePositions([], [0, 0, 0], nY)).toBeNull();
    expect(getSolidPolygonBasePositions([[0, 0, 0]], [0, 0, 0], nY)).toBeNull();
  });

  it('fills silhouette of non-coplanar loop projected onto first-click plane (+Y)', () => {
    const tetra: [number, number, number][] = [
      [0, 0, 0],
      [3, 0, 0],
      [0, 3, 0],
      [0, 0, 3]
    ];
    const base = getSolidPolygonBasePositions(tetra, tetra[0]!, nY);
    expect(base).not.toBeNull();
    expect(base!.length).toBeGreaterThan(0);
    for (const [, y] of base!) expect(y + 0).toBe(0);
  });

  it('returns axis-aligned square fill in plane through origin', () => {
    const sq: [number, number, number][] = [
      [0, 0, 0],
      [2, 0, 0],
      [2, 0, 2],
      [0, 0, 2]
    ];
    const base = getSolidPolygonBasePositions(sq, sq[0]!, nY);
    expect(base).not.toBeNull();
    expect(base!.length).toBeGreaterThan(0);
    for (const [, y] of base!) expect(y + 0).toBe(0);
  });
});

describe('getSolidPolygonStrokeVoxels', () => {
  const unitSquareY0: [number, number, number][] = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, 1],
    [0, 0, 1]
  ];
  const sqOrigin = unitSquareY0[0]!;

  it('depth 0 returns base only', () => {
    const base = getSolidPolygonBasePositions(unitSquareY0, sqOrigin, nY)!;
    const v = getSolidPolygonStrokeVoxels(unitSquareY0, sqOrigin, nY, 0, false);
    expect(v.length).toBe(base.length);
  });

  it('extrudes unit square by one layer along +Y', () => {
    const base = getSolidPolygonBasePositions(unitSquareY0, sqOrigin, nY)!;
    const v = getSolidPolygonStrokeVoxels(unitSquareY0, sqOrigin, nY, 1, false);
    expect(v.length).toBe(base.length * 2);
    const byY = new Map<number, number>();
    for (const [, y] of v) byY.set(y, (byY.get(y) ?? 0) + 1);
    expect(byY.get(0)).toBe(base.length);
    expect(byY.get(1)).toBe(base.length);
  });

  it('extrusion sign follows initial normal (+Y vs −Y)', () => {
    const vUp = getSolidPolygonStrokeVoxels(unitSquareY0, sqOrigin, nY, 1, false);
    const vDown = getSolidPolygonStrokeVoxels(unitSquareY0, sqOrigin, { x: 0, y: -1, z: 0 }, 1, false);
    const maxUp = Math.max(...vUp.map(([, y]) => y));
    const minDown = Math.min(...vDown.map(([, y]) => y));
    expect(maxUp).toBeGreaterThan(0);
    expect(minDown).toBeLessThan(0);
  });

  it('hollow shell removes interior voxels for a wide extrusion', () => {
    const big: [number, number, number][] = [
      [0, 0, 0],
      [4, 0, 0],
      [4, 0, 4],
      [0, 0, 4]
    ];
    const o = big[0]!;
    const solid = getSolidPolygonStrokeVoxels(big, o, nY, 4, false);
    const hollow = getSolidPolygonStrokeVoxels(big, o, nY, 4, true, 1);
    expect(hollow.length).toBeGreaterThan(0);
    expect(hollow.length).toBeLessThan(solid.length);
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

describe('getClothPatchFromPinsVoxels', () => {
  /** Triangle in XZ at y=10 (gravity −Y). */
  const tri: [number, number, number][] = [
    [0, 10, 0],
    [10, 10, 0],
    [5, 10, 8]
  ];
  const brushR = 1;

  it('returns empty for fewer than 3 pins', () => {
    expect(getClothPatchFromPinsVoxels([[0, 0, 0], [1, 0, 0]], 0.5, 'down', brushR)).toEqual([]);
  });

  it('is deterministic for fixed inputs', () => {
    const r1 = getClothPatchFromPinsVoxels(tri, 0.4, 'down', brushR);
    const r2 = getClothPatchFromPinsVoxels(tri, 0.4, 'down', brushR);
    expect(r1).toEqual(r2);
  });

  it('lower tension sags more than higher tension (min Y)', () => {
    const loose = getClothPatchFromPinsVoxels(tri, 0.15, 'down', brushR);
    const tight = getClothPatchFromPinsVoxels(tri, 0.95, 'down', brushR);
    expect(loose.length).toBeGreaterThan(0);
    expect(tight.length).toBeGreaterThan(0);
    const looseMinY = Math.min(...loose.map(([, y]) => y));
    const tightMinY = Math.min(...tight.map(([, y]) => y));
    expect(looseMinY).toBeLessThan(tightMinY);
  });

  it('high tension keeps interior higher than very low tension', () => {
    const stiff = getClothPatchFromPinsVoxels(tri, 1, 'down', brushR);
    const drapy = getClothPatchFromPinsVoxels(tri, 0, 'down', brushR);
    const stiffMinY = Math.min(...stiff.map(([, y]) => y));
    const drapyMinY = Math.min(...drapy.map(([, y]) => y));
    expect(stiffMinY).toBeGreaterThan(drapyMinY);
  });

  it('collinear pins returns a polyline of boundary voxels', () => {
    const line: [number, number, number][] = [
      [0, 0, 0],
      [3, 0, 0],
      [6, 0, 0]
    ];
    const result = getClothPatchFromPinsVoxels(line, 0.5, 'down', brushR);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(result.every(([x, , z]) => z === 0 && x >= 0 && x <= 6)).toBe(true);
  });

  it('produces many voxels for a small triangle patch', () => {
    const result = getClothPatchFromPinsVoxels(tri, 0.5, 'down', brushR);
    expect(result.length).toBeGreaterThan(8);
  });

  it('skew quad: output includes every pin voxel (corners snapped to clicks)', () => {
    const skew: [number, number, number][] = [
      [0, 20, 0],
      [12, 20, 0],
      [12, 20, 12],
      [0, 24, 4]
    ];
    const r = getClothPatchFromPinsVoxels(skew, 0.5, 'down', brushR);
    const keys = new Set(r.map(([x, y, z]) => `${x},${y},${z}`));
    for (const p of skew) {
      expect(keys.has(`${p[0]},${p[1]},${p[2]}`)).toBe(true);
    }
  });

  it('large pin bounding box completes quickly with bounded path length', () => {
    const big: [number, number, number][] = [
      [0, 0, 0],
      [12000, 0, 0],
      [6000, 9000, 0]
    ];
    const t0 = performance.now();
    const result = getClothPatchFromPinsVoxels(big, 0.5, 'down', brushR);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(1000);
    expect(result.length).toBeGreaterThan(0);
    /** Per-node voxels + edge Bresenham; stays well below multi-million voxel blowups. */
    expect(result.length).toBeLessThan(400_000);
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

  it('cube brush supports half-step size (radius 1.5 -> 4x4x4)', () => {
    const path: [number, number, number][] = [[0, 0, 0]];
    const result = applyBrushAlongPath(path, 'cube', 1.5);
    expect(result.length).toBe(64);
  });

  it('radius 0 returns original path', () => {
    const path: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0]
    ];
    expect(applyBrushAlongPath(path, 'sphere', 0)).toEqual(path);
    expect(applyBrushAlongPath(path, 'cube', 0)).toEqual(path);
  });
});

function sortPositionKeys(pos: [number, number, number][]): string[] {
  return pos.map(([a, b, c]) => `${a},${b},${c}`).sort();
}

describe('spray incremental droplet merge', () => {
  it('incremental sphere merge matches expandPathWithBrushStamps sphere (no scatter/range)', () => {
    const path: [number, number, number][] = [
      [0, 0, 0],
      [2, 0, 0],
      [4, 0, 0]
    ];
    const full = expandPathWithBrushStamps(path, 'sphere', 1.5, 0);
    const seen = new Set<string>();
    const out: [number, number, number][] = [];
    for (const p of path) {
      mergeSphereStampIntoSeen(p[0], p[1], p[2], 1.5, seen, out);
    }
    expect(sortPositionKeys(out)).toEqual(sortPositionKeys(full));
  });

  it('incremental cube merge matches spray cube thickenPathForStroke', () => {
    const path: [number, number, number][] = [
      [0, 0, 0],
      [3, 0, 0]
    ];
    const full = thickenPathForStroke(path, {
      ...defaultParams,
      strokeMode: 'spray',
      sprayBrushShape: 'cube',
      sprayRadius: 2
    });
    const seen = new Set<string>();
    const out: [number, number, number][] = [];
    for (const p of path) {
      mergeCubeStampIntoSeen(p[0], p[1], p[2], 2, seen, out);
    }
    expect(sortPositionKeys(out)).toEqual(sortPositionKeys(full));
  });

  it('incremental pyramid merge matches spray pyramid thickenPathForStroke', () => {
    const path: [number, number, number][] = [
      [0, 0, 0],
      [3, 0, 0]
    ];
    const full = thickenPathForStroke(path, {
      ...defaultParams,
      strokeMode: 'spray',
      sprayBrushShape: 'pyramid',
      sprayRadius: 2
    });
    const seen = new Set<string>();
    const out: [number, number, number][] = [];
    for (const p of path) {
      mergePyramidStampIntoSeen(p[0], p[1], p[2], 2, seen, out);
    }
    expect(sortPositionKeys(out)).toEqual(sortPositionKeys(full));
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

describe('resolveBranchExtrudeDirection', () => {
  /** View from +Z toward origin so view dir is not parallel to default up (+Y). */
  function cameraInFrontOfOrigin(): THREE.PerspectiveCamera {
    const c = new THREE.PerspectiveCamera();
    c.position.set(0, 0, 8);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld(true);
    return c;
  }

  it('camera: horizontal drag maps to world X (default scene)', () => {
    const cam = cameraInFrontOfOrigin();
    const d = resolveBranchExtrudeDirection('camera', {
      camera: cam,
      screenDx: 10,
      screenDy: 0,
      faceNormal: null
    });
    expect(Math.abs(d.x)).toBeGreaterThan(0.9);
    expect(Math.abs(d.y)).toBeLessThan(0.2);
    expect(Math.abs(d.z)).toBeLessThan(0.2);
  });

  it('camera: falls back to world up when drag is zero', () => {
    const cam = cameraInFrontOfOrigin();
    const d = resolveBranchExtrudeDirection('camera', {
      camera: cam,
      screenDx: 0,
      screenDy: 0,
      faceNormal: null
    });
    expect(d.y).toBeGreaterThan(0.9);
  });

  it('auto without face matches camera mode', () => {
    const cam = cameraInFrontOfOrigin();
    const a = resolveBranchExtrudeDirection('auto', {
      camera: cam,
      screenDx: 10,
      screenDy: 0,
      faceNormal: null
    });
    const b = resolveBranchExtrudeDirection('camera', {
      camera: cam,
      screenDx: 10,
      screenDy: 0,
      faceNormal: null
    });
    expect(a.x).toBeCloseTo(b.x, 5);
    expect(a.y).toBeCloseTo(b.y, 5);
    expect(a.z).toBeCloseTo(b.z, 5);
  });

  it('auto: uses face normal axis with sign from drag', () => {
    const cam = cameraInFrontOfOrigin();
    const pos = resolveBranchExtrudeDirection('auto', {
      camera: cam,
      screenDx: 10,
      screenDy: 0,
      faceNormal: { x: 1, y: 0, z: 0 }
    });
    expect(pos.x).toBeGreaterThan(0);
    const neg = resolveBranchExtrudeDirection('auto', {
      camera: cam,
      screenDx: -10,
      screenDy: 0,
      faceNormal: { x: 1, y: 0, z: 0 }
    });
    expect(neg.x).toBeLessThan(0);
  });

  it('axis X flips sign when screenDx flips', () => {
    const cam = cameraInFrontOfOrigin();
    const p = resolveBranchExtrudeDirection(0, {
      camera: cam,
      screenDx: 10,
      screenDy: 0,
      faceNormal: null
    });
    const q = resolveBranchExtrudeDirection(0, {
      camera: cam,
      screenDx: -10,
      screenDy: 0,
      faceNormal: null
    });
    expect(p.x * q.x).toBeLessThan(0);
    expect(Math.abs(p.x)).toBe(1);
    expect(Math.abs(q.x)).toBe(1);
  });

  it('null camera uses +Y for camera mode degenerate drag', () => {
    const d = resolveBranchExtrudeDirection('camera', {
      camera: null,
      screenDx: 0,
      screenDy: 0,
      faceNormal: null
    });
    expect(d).toEqual({ x: 0, y: 1, z: 0 });
  });
});
