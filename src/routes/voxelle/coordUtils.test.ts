import { describe, it, expect } from 'vitest';
import {
  coordKey,
  parseCoordKey,
  inBounds,
  inBoundsBox,
  getEffectiveBounds,
  getSelectionAnchor,
  getSelectionBounds,
  getVoxelBounds,
  getVoxelCenter,
  defaultAddShapePlacementAnchor,
  getBoundsFromPositions,
  getSelectionCenter,
  selectionAabbWireframePositions
} from './coordUtils';

describe('coordKey', () => {
  it('formats integer coords as "x,y,z"', () => {
    expect(coordKey(0, 0, 0)).toBe('0,0,0');
    expect(coordKey(1, -2, 3)).toBe('1,-2,3');
  });

  it('floors non-integer values', () => {
    expect(coordKey(1.7, 2.3, -0.9)).toBe('1,2,-1');
  });
});

describe('parseCoordKey', () => {
  it('parses "x,y,z" to [x,y,z]', () => {
    expect(parseCoordKey('0,0,0')).toEqual([0, 0, 0]);
    expect(parseCoordKey('1,-2,3')).toEqual([1, -2, 3]);
  });
});

describe('inBounds', () => {
  it('returns true for coords in [-size/2, size/2)', () => {
    expect(inBounds(0, 0, 0, 8)).toBe(true);
    expect(inBounds(-4, 3, -1, 8)).toBe(true);
    expect(inBounds(3, 3, 3, 8)).toBe(true);
  });

  it('returns false for coords outside bounds', () => {
    expect(inBounds(4, 0, 0, 8)).toBe(false); // x >= size/2
    expect(inBounds(-5, 0, 0, 8)).toBe(false); // x < -size/2
    expect(inBounds(0, 4, 0, 8)).toBe(false);
    expect(inBounds(0, 0, -5, 8)).toBe(false);
  });

  it('handles size 1', () => {
    expect(inBounds(0, 0, 0, 1)).toBe(true);
    expect(inBounds(-1, 0, 0, 1)).toBe(false);
  });

  it('returns true for any coord when size is undefined (unbounded)', () => {
    expect(inBounds(0, 0, 0)).toBe(true);
    expect(inBounds(1e6, -1e6, 0)).toBe(true);
    expect(inBounds(4, 0, 0)).toBe(true);
  });

  it('returns true for any coord when size is null (unbounded)', () => {
    expect(inBounds(100, 100, 100, null)).toBe(true);
  });
});

describe('inBoundsBox', () => {
  const b = { minX: -1, minY: 0, minZ: 1, maxX: 2, maxY: 2, maxZ: 3 };
  it('returns true inside box', () => {
    expect(inBoundsBox(0, 1, 2, b)).toBe(true);
    expect(inBoundsBox(-1, 0, 1, b)).toBe(true);
    expect(inBoundsBox(2, 2, 3, b)).toBe(true);
  });
  it('returns false outside box', () => {
    expect(inBoundsBox(-2, 0, 1, b)).toBe(false);
    expect(inBoundsBox(3, 1, 2, b)).toBe(false);
  });
});

describe('getEffectiveBounds', () => {
  it('returns ±margin around origin when empty', () => {
    expect(getEffectiveBounds(new Map(), 8)).toEqual({
      minX: -8,
      minY: -8,
      minZ: -8,
      maxX: 8,
      maxY: 8,
      maxZ: 8
    });
  });
  it('returns voxel bounds + margin when non-empty', () => {
    const v = new Map<string, number>([
      ['10,20,30', 0xff],
      ['15,25,35', 0xff]
    ]);
    const b = getEffectiveBounds(v, 5);
    expect(b.minX).toBe(5);
    expect(b.maxX).toBe(20);
    expect(b.minY).toBe(15);
    expect(b.maxY).toBe(30);
    expect(b.minZ).toBe(25);
    expect(b.maxZ).toBe(40);
  });
  it('caps empty-map margin at 1e5', () => {
    const b = getEffectiveBounds(new Map(), 2e5);
    expect(b.minX).toBe(-1e5);
    expect(b.maxX).toBe(1e5);
  });
});

describe('getSelectionAnchor', () => {
  it('returns null for empty selection', () => {
    expect(getSelectionAnchor(new Map())).toBeNull();
  });

  it('returns min corner for non-empty selection', () => {
    const sel = new Map<string, number>([
      ['1,2,3', 0xff0000],
      ['-1,0,5', 0x00ff00],
      ['0,-2,1', 0x0000ff]
    ]);
    expect(getSelectionAnchor(sel)).toEqual([-1, -2, 1]);
  });

  it('returns single coord for one voxel', () => {
    const sel = new Map([['5,5,5', 0x888888]]);
    expect(getSelectionAnchor(sel)).toEqual([5, 5, 5]);
  });
});

describe('getSelectionBounds', () => {
  it('returns null for empty selection', () => {
    expect(getSelectionBounds(new Map())).toBeNull();
  });

  it('returns correct bounds for selection', () => {
    const sel = new Map<string, number>([
      ['1,2,3', 0xff0000],
      ['-1,0,5', 0x00ff00],
      ['0,-2,1', 0x0000ff]
    ]);
    expect(getSelectionBounds(sel)).toEqual({
      minX: -1,
      minY: -2,
      minZ: 1,
      maxX: 1,
      maxY: 2,
      maxZ: 5
    });
  });
});

describe('getVoxelBounds', () => {
  it('returns null for empty voxels', () => {
    expect(getVoxelBounds(new Map())).toBeNull();
  });

  it('returns same structure as getSelectionBounds', () => {
    const v = new Map<string, number>([
      ['2,0,0', 0xff],
      ['0,2,0', 0xff],
      ['0,0,2', 0xff]
    ]);
    expect(getVoxelBounds(v)).toEqual({
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 2,
      maxY: 2,
      maxZ: 2
    });
  });
});

describe('getVoxelCenter', () => {
  it('returns null for empty voxels', () => {
    expect(getVoxelCenter(new Map())).toBeNull();
  });

  it('returns center of single voxel', () => {
    const v = new Map([['0,0,0', 0xff]]);
    expect(getVoxelCenter(v)).toEqual([0.5, 0.5, 0.5]);
  });

  it('returns center of 2x2x2 cube', () => {
    const v = new Map<string, number>();
    for (let x = 0; x < 2; x++)
      for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) v.set(coordKey(x, y, z), 0xff);
    expect(getVoxelCenter(v)).toEqual([1, 1, 1]);
  });
});

describe('getBoundsFromPositions', () => {
  it('returns null for empty positions', () => {
    expect(getBoundsFromPositions([])).toBeNull();
  });

  it('returns correct bounds for positions array', () => {
    const pos: [number, number, number][] = [
      [1, 2, 3],
      [-1, 0, 5],
      [0, -2, 1]
    ];
    expect(getBoundsFromPositions(pos)).toEqual({
      minX: -1,
      minY: -2,
      minZ: 1,
      maxX: 1,
      maxY: 2,
      maxZ: 5
    });
  });
});

describe('getSelectionCenter', () => {
  it('returns null for empty selection', () => {
    expect(getSelectionCenter(new Map())).toBeNull();
  });

  it('returns center of selection bounds', () => {
    const sel = new Map<string, number>([
      ['0,0,0', 0xff],
      ['2,2,2', 0xff]
    ]);
    expect(getSelectionCenter(sel)).toEqual([1.5, 1.5, 1.5]);
  });
});

describe('selectionAabbWireframePositions', () => {
  it('emits 12 edges (72 floats) for unit box at origin', () => {
    const p = selectionAabbWireframePositions({
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 0,
      maxY: 0,
      maxZ: 0
    });
    expect(p.length).toBe(72);
    expect(Array.from(p.slice(0, 6))).toEqual([0, 0, 0, 1, 0, 0]);
  });
});

describe('defaultAddShapePlacementAnchor', () => {
  it('uses rounded voxel bounds center when map is non-empty (ignores orbit target)', () => {
    const v = new Map<string, number>([
      ['0,0,0', 1],
      ['1,0,0', 1]
    ]);
    expect(defaultAddShapePlacementAnchor(v, { x: 99, y: 99, z: 99 })).toEqual([1, 1, 1]);
  });

  it('uses rounded orbit target when map is empty', () => {
    expect(
      defaultAddShapePlacementAnchor(new Map(), { x: 3.2, y: -1.6, z: 0.4 })
    ).toEqual([3, -2, 0]);
  });
});
