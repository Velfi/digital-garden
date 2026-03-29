import { describe, expect, it } from 'vitest';
import {
  computeMetaballVoxelPositions,
  sampleMetaballFieldAtCellCenter,
  shellVoxelPositions
} from './metaballField';
import type { SquishyMetaball } from './state';

describe('metaballField', () => {
  it('sample is high near center and low far away', () => {
    const balls: SquishyMetaball[] = [{ id: 'a', x: 0, y: 0, z: 0, radius: 2 }];
    expect(sampleMetaballFieldAtCellCenter(balls, 0, 0, 0)).toBeGreaterThan(1);
    expect(sampleMetaballFieldAtCellCenter(balls, 5, 5, 5)).toBeLessThan(1);
  });

  it('voxelizes to non-empty set for one metaball', () => {
    const balls: SquishyMetaball[] = [{ id: 'a', x: 0, y: 0, z: 0, radius: 2 }];
    const result = computeMetaballVoxelPositions(balls);
    expect(result.positions.length).toBeGreaterThan(0);
    expect(result.positions.some(([x, y, z]) => x === 0 && y === 0 && z === 0)).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it('shellVoxelPositions with thickness 1 removes 3×3×3 interior', () => {
    const solid: [number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) solid.push([x, y, z]);
    const shell = shellVoxelPositions(solid, 1);
    expect(shell.length).toBe(26);
    expect(shell.some(([x, y, z]) => x === 1 && y === 1 && z === 1)).toBe(false);
  });

  it('shellVoxelPositions with thickness 2 keeps full 3×3×3', () => {
    const solid: [number, number, number][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) solid.push([x, y, z]);
    expect(shellVoxelPositions(solid, 2).length).toBe(27);
  });
});
