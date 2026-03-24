import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { voxels, hiddenVoxels, gridSize, focalLength, orthographic, resetUndo } from './core';
import {
  loadFromStorage,
  loadFromStorageAsync,
  saveToStorage,
  saveToStoragePromise,
  getSkipStartup,
  setSkipStartup,
  autosaveError
} from './storage';
import { plasticVoxel } from '../voxelMaterial';

const mockStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockStorage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    mockStorage[key] = value;
  }),
  clear: () => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  }
};

vi.mock('$app/environment', () => ({ browser: true }));
vi.stubGlobal('localStorage', localStorageMock);

describe('storage', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    voxels.set(new Map());
    hiddenVoxels.set(new Map());
    gridSize.set(32);
    focalLength.set(29);
    orthographic.set(true);
    resetUndo();
    autosaveError.set(null);
  });

  describe('saveToStorage / loadFromStorage', () => {
    it('round-trips voxels and autoshrunk gridSize', () => {
      voxels.set(
        new Map([
          ['0,0,0', plasticVoxel(0xff0000)],
          ['1,1,1', plasticVoxel(0x00ff00)]
        ])
      );
      saveToStorage();
      expect(get(gridSize)).toBe(4);
      voxels.set(new Map());
      gridSize.set(16);
      const result = loadFromStorage();
      expect(result).toBe(true);
      expect(get(gridSize)).toBe(4);
      expect(get(voxels).get('0,0,0')).toEqual(plasticVoxel(0xff0000));
      expect(get(voxels).get('1,1,1')).toEqual(plasticVoxel(0x00ff00));
    });

    it('round-trips hidden voxels', () => {
      voxels.set(new Map([[`0,0,0`, plasticVoxel(0xff0000)]]));
      hiddenVoxels.set(new Map([[`1,0,0`, plasticVoxel(0x00ff00)]]));
      saveToStorage();
      voxels.set(new Map());
      hiddenVoxels.set(new Map());
      const result = loadFromStorage();
      expect(result).toBe(true);
      expect(get(voxels).get('0,0,0')).toEqual(plasticVoxel(0xff0000));
      expect(get(hiddenVoxels).get('1,0,0')).toEqual(plasticVoxel(0x00ff00));
    });

    it('loadFromStorage returns false when empty', () => {
      const result = loadFromStorage();
      expect(result).toBe(false);
    });

    it('loadFromStorage returns false for invalid data', () => {
      localStorage.setItem('voxelle', 'invalid json');
      const result = loadFromStorage();
      expect(result).toBe(false);
    });

    it('sets autosaveError when localStorage.setItem throws', () => {
      vi.mocked(localStorage.setItem).mockImplementationOnce((key: string, value: string) => {
        if (key === 'voxelle') throw new DOMException('QuotaExceeded', 'QuotaExceededError');
        mockStorage[key] = value;
      });
      saveToStorage();
      const err = get(autosaveError);
      expect(err).toBeTruthy();
      expect(err).toContain('full');
    });

    it('clears autosaveError on successful save after a failure', () => {
      vi.mocked(localStorage.setItem).mockImplementationOnce((key: string, value: string) => {
        if (key === 'voxelle') throw new Error('QuotaExceeded');
        mockStorage[key] = value;
      });
      saveToStorage();
      expect(get(autosaveError)).toBeTruthy();
      saveToStorage();
      expect(get(autosaveError)).toBeNull();
    });

    it('loadFromStorageAsync restores from localStorage when IndexedDB is unavailable', async () => {
      expect(await loadFromStorageAsync()).toBe(false);
      voxels.set(new Map([['0,0,0', plasticVoxel(0xff0000)]]));
      await saveToStoragePromise();
      expect(get(gridSize)).toBe(2);
      voxels.set(new Map());
      gridSize.set(16);
      expect(await loadFromStorageAsync()).toBe(true);
      expect(get(gridSize)).toBe(2);
      expect(get(voxels).get('0,0,0')).toEqual(plasticVoxel(0xff0000));
    });
  });

  describe('getSkipStartup / setSkipStartup', () => {
    it('round-trips skip startup flag', () => {
      expect(getSkipStartup()).toBe(false);
      setSkipStartup(true);
      expect(getSkipStartup()).toBe(true);
      setSkipStartup(false);
      expect(getSkipStartup()).toBe(false);
    });
  });
});
