/**
 * Pure logic for converting image pixel data to voxel entries.
 * Used by importImage.worker. Testable without ImageBitmap/OffscreenCanvas.
 *
 * Output format: [x, z, color][] where x,z are centered (pixel coords minus width/2, height/2).
 * Skips pixels with alpha < 128.
 */
export function imageDataToVoxelEntries(
  data: Uint8ClampedArray,
  width: number,
  height: number
): [number, number, number][] {
  const entries: [number, number, number][] = [];
  const ox = Math.floor(width / 2);
  const oz = Math.floor(height / 2);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const i = (py * width + px) * 4;
      const a = data[i + 3] ?? 0;
      if (a < 128) continue;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const col = ((r << 16) | (g << 8) | b) >>> 0;
      entries.push([px - ox, py - oz, col]);
    }
  }
  return entries;
}
