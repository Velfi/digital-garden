import { serialize as bsonSerialize, deserialize as bsonDeserialize } from 'bson';

export type VoxelleFileFormat = {
  version: number;
  gridSize: number;
  voxels: [number, number, number, number][];
  scene?: {
    focalLength?: number;
    orthographic?: boolean;
  };
};

function parseFullFormat(raw: unknown): VoxelleFileFormat | null {
  const data = raw as VoxelleFileFormat;
  if (!data || typeof data.version !== 'number' || typeof data.gridSize !== 'number') return null;
  const sz = data.gridSize;
  if (sz < 1 || !Number.isInteger(sz)) return null;
  if (!Array.isArray(data.voxels)) return null;
  const voxelsArr: [number, number, number, number][] = [];
  for (const e of data.voxels) {
    if (!Array.isArray(e) || e.length !== 4) continue;
    const [x, y, z, col] = e;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof z !== 'number' ||
      typeof col !== 'number'
    )
      continue;
    voxelsArr.push([Math.floor(x), Math.floor(y), Math.floor(z), col >>> 0]);
  }
  return { version: data.version, gridSize: sz, voxels: voxelsArr, scene: data.scene };
}

/** Parse BSON payload to VoxelleFileFormat. Used by worker and tests. */
export function parseFormatPayload(bytes: Uint8Array): VoxelleFileFormat | null {
  try {
    return parseFullFormat(bsonDeserialize(bytes, { allowObjectSmallerThanBufferSize: true }));
  } catch (e) {
    console.error('[Voxelle] Parse error:', e);
    return null;
  }
}

/** Serialize VoxelleFileFormat to BSON bytes. Used by worker and tests. */
export function serializeFormatToBson(data: VoxelleFileFormat): Uint8Array {
  const bsonBytes = bsonSerialize(data);
  return new Uint8Array(
    bsonBytes.buffer.slice(bsonBytes.byteOffset, bsonBytes.byteOffset + bsonBytes.byteLength)
  );
}
