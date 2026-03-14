import { get } from 'svelte/store';
import { coordKey } from '../coordUtils';
import { voxels, selection, ensureGridFitsPositions, pushUndo } from './core';

const LARGE_IMAGE_PIXELS = 256 * 256; // 65536 pixels – show confirmation above this

function createWorker(): Worker {
  return new Worker(new URL('./importImage.worker.ts', import.meta.url), { type: 'module' });
}

function processInWorker(bitmap: ImageBitmap): Promise<[number, number, number][]> {
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    worker.onmessage = (e: MessageEvent<{ type: string; entries?: [number, number, number][] }>) => {
      worker.terminate();
      if (e.data.type === 'done' && e.data.entries) {
        resolve(e.data.entries);
      } else {
        resolve([]);
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage({ type: 'process', bitmap }, [bitmap]);
  });
}

/**
 * Load image file, convert each pixel to a voxel on a flat Y=0 plane.
 * Image is centered: pixel (0,0) → voxel (-w/2, 0, -h/2).
 * Skips fully transparent pixels (alpha < 128).
 * Returns true on success; sets selection to the new voxels.
 */
export async function importImageFromFile(file: File): Promise<boolean> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return false;
  }

  const pixelCount = bitmap.width * bitmap.height;
  if (pixelCount > LARGE_IMAGE_PIXELS) {
    const proceed = confirm(
      `This image is ${bitmap.width}×${bitmap.height} (${pixelCount.toLocaleString()} pixels). ` +
        `Processing large images can take several seconds and may temporarily slow the app. Continue?`
    );
    if (!proceed) {
      bitmap.close();
      return false;
    }
  }

  let entries: [number, number, number][];
  try {
    entries = await processInWorker(bitmap);
  } catch {
    return false;
  }

  if (entries.length === 0) return false;

  const voxelMap = new Map<string, number>();
  const selectionMap = new Map<string, number>();
  for (const [x, z, col] of entries) {
    const key = coordKey(x, 0, z);
    voxelMap.set(key, col);
    selectionMap.set(key, col);
  }

  const positions = [...voxelMap.keys()].map((k) => {
    const [x, y, z] = k.split(',').map(Number);
    return [x, y, z] as [number, number, number];
  });
  ensureGridFitsPositions(positions);

  pushUndo();
  const v = get(voxels);
  const next = new Map(v);
  for (const [key, col] of voxelMap) {
    next.set(key, col);
  }
  voxels.set(next);
  selection.set(selectionMap);
  return true;
}
