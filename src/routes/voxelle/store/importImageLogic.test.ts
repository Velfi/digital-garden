import { describe, it, expect } from 'vitest';
import { imageDataToVoxelEntries } from './importImageLogic';

describe('imageDataToVoxelEntries', () => {
  function makeImageData(
    width: number,
    height: number,
    pixels: Array<{ x: number; y: number; r: number; g: number; b: number; a: number }>
  ): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4);
    for (const p of pixels) {
      const i = (p.y * width + p.x) * 4;
      data[i] = p.r;
      data[i + 1] = p.g;
      data[i + 2] = p.b;
      data[i + 3] = p.a;
    }
    return data;
  }

  it('returns empty for fully transparent image', () => {
    const data = makeImageData(2, 2, [
      { x: 0, y: 0, r: 255, g: 0, b: 0, a: 0 },
      { x: 1, y: 0, r: 0, g: 255, b: 0, a: 0 }
    ]);
    const entries = imageDataToVoxelEntries(data, 2, 2);
    expect(entries).toHaveLength(0);
  });

  it('includes opaque pixels', () => {
    const data = makeImageData(2, 2, [
      { x: 0, y: 0, r: 255, g: 0, b: 0, a: 255 },
      { x: 1, y: 1, r: 0, g: 255, b: 0, a: 255 }
    ]);
    const entries = imageDataToVoxelEntries(data, 2, 2);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual([-1, -1, 0xff0000]);
    expect(entries[1]).toEqual([0, 0, 0x00ff00]);
  });

  it('centers coords for 2x2 image', () => {
    const data = makeImageData(2, 2, [{ x: 0, y: 0, r: 255, g: 255, b: 255, a: 255 }]);
    const entries = imageDataToVoxelEntries(data, 2, 2);
    expect(entries[0]).toEqual([-1, -1, 0xffffff]);
  });

  it('skips pixels with alpha < 128', () => {
    const data = makeImageData(1, 1, [{ x: 0, y: 0, r: 255, g: 0, b: 0, a: 127 }]);
    const entries = imageDataToVoxelEntries(data, 1, 1);
    expect(entries).toHaveLength(0);
  });

  it('includes pixels with alpha >= 128', () => {
    const data = makeImageData(1, 1, [{ x: 0, y: 0, r: 255, g: 0, b: 0, a: 128 }]);
    const entries = imageDataToVoxelEntries(data, 1, 1);
    expect(entries).toHaveLength(1);
    expect(entries[0][2]).toBe(0xff0000);
  });
});
