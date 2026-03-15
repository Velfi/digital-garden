import { describe, it, expect } from 'vitest';
import { voxelsFromInput, processGreedyMeshMessage } from './greedyMeshWorkerLogic';
import { coordKey } from './coordUtils';

describe('greedyMeshWorkerLogic', () => {
  describe('voxelsFromInput', () => {
    it('parses array format [key, color][]', () => {
      const input: [string, number][] = [
        ['0,0,0', 0xff0000],
        ['1,1,1', 0x00ff00]
      ];
      const voxels = voxelsFromInput(input);
      expect(voxels.size).toBe(2);
      expect(voxels.get('0,0,0')).toBe(0xff0000);
      expect(voxels.get('1,1,1')).toBe(0x00ff00);
    });

    it('parses flat coords/colors format', () => {
      const coords = new Int32Array([0, 0, 0, 1, 1, 1]);
      const colors = new Uint32Array([0xff0000, 0x00ff00]);
      const voxels = voxelsFromInput({ coords, colors });
      expect(voxels.size).toBe(2);
      expect(voxels.get('0,0,0')).toBe(0xff0000);
      expect(voxels.get('1,1,1')).toBe(0x00ff00);
    });

    it('handles empty array input', () => {
      const voxels = voxelsFromInput([]);
      expect(voxels.size).toBe(0);
    });
  });

  describe('processGreedyMeshMessage', () => {
    it('returns results for single voxel', () => {
      const input = {
        voxels: [['0,0,0', 0x888888]] as [string, number][]
      };
      const output = processGreedyMeshMessage(input);
      expect(output.results).toHaveLength(1);
      expect(output.results[0].color).toBe(0x888888);
      expect(output.results[0].positions.length).toBeGreaterThan(0);
      expect(output.results[0].normals.length).toBeGreaterThan(0);
      expect(output.results[0].indices.length).toBeGreaterThan(0);
    });

    it('echoes gen in output', () => {
      const input = {
        voxels: [['0,0,0', 0xff0000]] as [string, number][],
        gen: 42
      };
      const output = processGreedyMeshMessage(input);
      expect(output.gen).toBe(42);
    });

    it('works with flat coords/colors format', () => {
      const coords = new Int32Array([0, 0, 0]);
      const colors = new Uint32Array([0xff5733]);
      const output = processGreedyMeshMessage({ voxels: { coords, colors } });
      expect(output.results).toHaveLength(1);
      expect(output.results[0].color).toBe(0xff5733);
    });
  });
});
