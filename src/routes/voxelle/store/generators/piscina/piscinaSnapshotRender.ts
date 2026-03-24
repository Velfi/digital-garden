/**
 * Deterministic orthographic renders of voxel maps for snapshot / reference images.
 * BMP output avoids extra PNG dependencies; binary baselines use `assertBmpFileSnapshot` (raw bytes).
 */
import { parseCoordKey } from '../../../coordUtils';
import type { Voxel } from '../../../voxelMaterial';

const DEFAULT_BG = { r: 0xe8, g: 0xee, b: 0xf4, a: 0xff };

export type PiscinaSnapshotView = 'profile' | 'top';

/** Windows BMP 24-bit, bottom-up BGR, top-down RGBA input. */
function encodeBmp24(width: number, height: number, rgbaTopDown: Uint8Array): Buffer {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const imgSize = rowStride * height;
  const fileSize = 54 + imgSize;
  const buf = Buffer.alloc(fileSize);
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(imgSize, 34);
  buf.writeInt32LE(0, 38);
  buf.writeInt32LE(0, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  let offset = 54;
  for (let row = height - 1; row >= 0; row--) {
    let col = 0;
    for (let x = 0; x < width; x++) {
      const i = (row * width + x) * 4;
      buf[offset + col++] = rgbaTopDown[i + 2]!;
      buf[offset + col++] = rgbaTopDown[i + 1]!;
      buf[offset + col++] = rgbaTopDown[i]!;
    }
    while (col < rowStride) buf[offset + col++] = 0;
    offset += rowStride;
  }
  return buf;
}

function voxelBounds(map: Map<string, Voxel>): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} | null {
  if (map.size === 0) return null;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const k of map.keys()) {
    const [x, y, z] = parseCoordKey(k);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Renders voxels in orthographic projection (fish on floor: nose–tail +X, lateral +Y, up +Z).
 * - profile: look along −Y; image x = X, image y = Z (dorsal up).
 * - top: look along −Z; image x = X, image y = Y (consistent +X rightward).
 */
export function renderVoxelMapOrthographicBmp(
  map: Map<string, Voxel>,
  view: PiscinaSnapshotView,
  outSize = 320
): Buffer {
  const b = voxelBounds(map);
  if (!b) {
    const empty = new Uint8Array(outSize * outSize * 4);
    for (let i = 0; i < empty.length; i += 4) {
      empty[i] = DEFAULT_BG.r;
      empty[i + 1] = DEFAULT_BG.g;
      empty[i + 2] = DEFAULT_BG.b;
      empty[i + 3] = DEFAULT_BG.a;
    }
    return encodeBmp24(outSize, outSize, empty);
  }

  const pad = 2;
  const minX = b.minX - pad;
  const maxX = b.maxX + pad;
  const minY = b.minY - pad;
  const maxY = b.maxY + pad;
  const minZ = b.minZ - pad;
  const maxZ = b.maxZ + pad;

  const outW = outSize;
  const outH = outSize;
  const depthBuf = new Float32Array(outW * outH);
  depthBuf.fill(-Infinity);
  const rgba = new Uint8Array(outW * outH * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = DEFAULT_BG.r;
    rgba[i + 1] = DEFAULT_BG.g;
    rgba[i + 2] = DEFAULT_BG.b;
    rgba[i + 3] = DEFAULT_BG.a;
  }

  if (view === 'profile') {
    const spanH = Math.max(1, maxX - minX);
    const spanV = Math.max(1, maxZ - minZ);
    for (const [k, v] of map) {
      const [x, y, z] = parseCoordKey(k);
      const fx = (x - minX) / spanH;
      const fy = (z - minZ) / spanV;
      const ox = Math.min(outW - 1, Math.max(0, Math.round(fx * (outW - 1))));
      const oy = Math.min(outH - 1, Math.max(0, Math.round((1 - fy) * (outH - 1))));
      const idx = oy * outW + ox;
      if (y > depthBuf[idx]!) {
        depthBuf[idx] = y;
        const r = (v.color >> 16) & 0xff;
        const g = (v.color >> 8) & 0xff;
        const bl = v.color & 0xff;
        const o = idx * 4;
        rgba[o] = r;
        rgba[o + 1] = g;
        rgba[o + 2] = bl;
        rgba[o + 3] = 0xff;
      }
    }
  } else {
    const spanH = Math.max(1, maxX - minX);
    const spanV = Math.max(1, maxY - minY);
    for (const [k, v] of map) {
      const [x, y, z] = parseCoordKey(k);
      const fx = (x - minX) / spanH;
      const fy = (y - minY) / spanV;
      const ox = Math.min(outW - 1, Math.max(0, Math.round(fx * (outW - 1))));
      const oy = Math.min(outH - 1, Math.max(0, Math.round((1 - fy) * (outH - 1))));
      const idx = oy * outW + ox;
      if (z > depthBuf[idx]!) {
        depthBuf[idx] = z;
        const r = (v.color >> 16) & 0xff;
        const g = (v.color >> 8) & 0xff;
        const bl = v.color & 0xff;
        const o = idx * 4;
        rgba[o] = r;
        rgba[o + 1] = g;
        rgba[o + 2] = bl;
        rgba[o + 3] = 0xff;
      }
    }
  }

  return encodeBmp24(outW, outH, rgba);
}
