import { describe, expect, it } from 'vitest';
import {
  computeMetaballVoxelPositions,
  metaballFieldAtCellCenterMeetsThreshold,
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

  it('metaballFieldAtCellCenterMeetsThreshold matches full sample vs threshold', () => {
    const balls: SquishyMetaball[] = [
      { id: 'a', x: 0, y: 0, z: 0, radius: 3 },
      { id: 'b', x: 8, y: 1, z: -2, radius: 2 }
    ];
    const threshold = 1;
    for (let x = -6; x <= 14; x++) {
      for (let y = -6; y <= 8; y++) {
        for (let z = -6; z <= 8; z++) {
          const full = sampleMetaballFieldAtCellCenter(balls, x, y, z);
          const meets = metaballFieldAtCellCenterMeetsThreshold(balls, x, y, z, threshold);
          expect(meets).toBe(full >= threshold);
        }
      }
    }
  });

  it('computeMetaballVoxelPositions matches brute-force inside AABB', () => {
    const balls: SquishyMetaball[] = [
      { id: 'a', x: 1, y: 0, z: 0, radius: 2.5 },
      { id: 'b', x: -3, y: 2, z: 1, radius: 1.5 }
    ];
    const threshold = 1;
    const padding = 2;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const ball of balls) {
      const extent = Math.ceil(ball.radius + padding);
      minX = Math.min(minX, ball.x - extent);
      minY = Math.min(minY, ball.y - extent);
      minZ = Math.min(minZ, ball.z - extent);
      maxX = Math.max(maxX, ball.x + extent);
      maxY = Math.max(maxY, ball.y + extent);
      maxZ = Math.max(maxZ, ball.z + extent);
    }
    const brute: [number, number, number][] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (sampleMetaballFieldAtCellCenter(balls, x, y, z) >= threshold) brute.push([x, y, z]);
        }
      }
    }
    const result = computeMetaballVoxelPositions(balls, { padding, threshold });
    expect(result.positions.length).toBe(brute.length);
    const set = new Set(brute.map(([x, y, z]) => `${x},${y},${z}`));
    for (const p of result.positions) {
      expect(set.has(`${p[0]},${p[1]},${p[2]}`)).toBe(true);
    }
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
