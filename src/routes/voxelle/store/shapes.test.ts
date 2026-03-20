import { describe, it, expect } from 'vitest';
import { initShape, getShapePositionsAt, clampQuarterTurn } from './shapes';
import { coordKey } from '../coordUtils';

describe('initShape', () => {
  it('empty returns empty map', () => {
    expect(initShape(8, 'empty').size).toBe(0);
  });

  it('cube fills all voxels in bounds', () => {
    const v = initShape(3, 'cube');
    // 3x3x3 = 27 voxels, centered at origin: -1..1
    expect(v.size).toBe(27);
    expect(v.has(coordKey(0, 0, 0))).toBe(true);
    expect(v.has(coordKey(-1, -1, -1))).toBe(true);
    expect(v.has(coordKey(1, 1, 1))).toBe(true);
  });

  it('orb is sphere (x²+y²+z² <= r²)', () => {
    const v = initShape(5, 'orb');
    expect(v.size).toBeLessThan(125); // fewer than full cube
    expect(v.has(coordKey(0, 0, 0))).toBe(true);
    expect(v.has(coordKey(2, 2, 2))).toBe(false); // outside sphere for r=2
  });

  it('cylinder is x²+z² <= r² (y unrestricted in bounds)', () => {
    const v = initShape(5, 'cylinder');
    expect(v.size).toBeGreaterThan(0);
    expect(v.has(coordKey(0, 0, 0))).toBe(true);
  });

  it('hollowCube has only face voxels', () => {
    const v = initShape(5, 'hollowCube');
    expect(v.size).toBeLessThan(125);
    expect(v.has(coordKey(-2, -2, -2))).toBe(true);
    expect(v.has(coordKey(0, -2, 0))).toBe(true);
    expect(v.has(coordKey(0, 0, 0))).toBe(false);
  });

  it('plane is y=0 slice', () => {
    const v = initShape(5, 'plane');
    for (const key of v.keys()) {
      const [, y] = key.split(',').map(Number);
      expect(y).toBe(0);
    }
  });

  it('circle is y=0 disk (x²+z² <= r²)', () => {
    const v = initShape(5, 'circle');
    for (const key of v.keys()) {
      const [x, y, z] = key.split(',').map(Number);
      expect(y).toBe(0);
      expect(x * x + z * z).toBeLessThanOrEqual(4); // r=2, r²=4
    }
    expect(v.has(coordKey(0, 0, 0))).toBe(true);
    expect(v.has(coordKey(2, 0, 0))).toBe(true);
    expect(v.has(coordKey(2, 0, 2))).toBe(false);
  });

  it('size < 1 returns empty', () => {
    expect(initShape(0, 'cube').size).toBe(0);
  });
});

describe('clampQuarterTurn', () => {
  it('clamps to 0–3', () => {
    expect(clampQuarterTurn(0)).toBe(0);
    expect(clampQuarterTurn(3)).toBe(3);
    expect(clampQuarterTurn(3.9)).toBe(3);
    expect(clampQuarterTurn(-1)).toBe(0);
    expect(clampQuarterTurn(5)).toBe(3);
  });
});

describe('getShapePositionsAt', () => {
  it('empty shape returns empty array', () => {
    expect(
      getShapePositionsAt({ position: [0, 0, 0], rotation: [0, 0, 0], shape: 'empty', size: 8 })
    ).toEqual([]);
  });

  it('positions are translated by position param', () => {
    const pos = getShapePositionsAt({
      position: [5, 5, 5],
      rotation: [0, 0, 0],
      shape: 'cube',
      size: 1
    });
    expect(pos).toHaveLength(1);
    expect(pos[0]).toEqual([5, 5, 5]);
  });

  it('rotated cube has different positions', () => {
    const noRot = getShapePositionsAt({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      shape: 'cube',
      size: 3
    });
    const rotY = getShapePositionsAt({
      position: [0, 0, 0],
      rotation: [0, 1, 0],
      shape: 'cube',
      size: 3
    });
    expect(noRot.length).toBe(rotY.length);
    expect(noRot).not.toEqual(rotY);
  });
});
