import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  voxels,
  gridSize,
  focalLength,
  orthographic,
  resetUndo
} from './core';
import { loadFromStorage, saveToStorage, getSkipStartup, setSkipStartup } from './storage';

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
    gridSize.set(32);
    focalLength.set(29);
    orthographic.set(true);
    resetUndo();
  });

  describe('saveToStorage / loadFromStorage', () => {
    it('round-trips voxels and gridSize', () => {
      voxels.set(
        new Map([
          ['0,0,0', 0xff0000],
          ['1,1,1', 0x00ff00]
        ])
      );
      saveToStorage();
      voxels.set(new Map());
      gridSize.set(16);
      const result = loadFromStorage();
      expect(result).toBe(true);
      expect(get(gridSize)).toBe(32);
      expect(get(voxels).get('0,0,0')).toBe(0xff0000);
      expect(get(voxels).get('1,1,1')).toBe(0x00ff00);
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
