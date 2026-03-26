import {
  calculateObjectSize,
  deserialize as bsonDeserialize,
  serialize as bsonSerialize,
  type Document
} from 'bson';
import type { Voxel, VoxelMaterialId } from '../voxelMaterial';
import { normalizeLegacyVoxel, parseVoxelMaterial } from '../voxelMaterial';

export const VOXELLE_FORMAT_VERSION = 2;

/** File voxel row: legacy 4-tuple or v2 with material string. */
export type VoxelleFileVoxelRow =
  | [number, number, number, number]
  | [number, number, number, number, string];

export type VoxelleFileFormat = {
  version: number;
  gridSize: number;
  voxels: VoxelleFileVoxelRow[];
  hiddenVoxels?: VoxelleFileVoxelRow[];
  scene?: {
    focalLength?: number;
    orthographic?: boolean;
    atmosphere?: {
      enabled?: boolean;
      color?: string;
      thickness?: number;
      density?: number;
      mode?: 'slab' | 'positiveSide';
      spatial?: 'plane' | 'aerial';
      heightBias?: number;
      heightFalloff?: number;
      driftEnabled?: boolean;
      driftAmount?: number;
      driftScale?: number;
      driftSpeed?: number;
      plane?: { nx: number; ny: number; nz: number; c: number };
      planeValid?: boolean;
      distanceTintEnabled?: boolean;
      distanceTintNearColor?: string;
      distanceTintMidColor?: string;
      distanceTintFarColor?: string;
      distanceTintNearDistance?: number;
      distanceTintFarDistance?: number;
      distanceTintStrength?: number;
      grainEnabled?: boolean;
      grainStrength?: number;
      grainAnimated?: boolean;
      grainSpeed?: number;
      sunShaftsEnabled?: boolean;
      sunShaftsStrength?: number;
      sunShaftsDecay?: number;
      sunShaftsDensity?: number;
      sunShaftsWeight?: number;
      sunShaftsSamples?: number;
    };
  };
};

function rowToVoxel(
  row: VoxelleFileVoxelRow
): { x: number; y: number; z: number; voxel: Voxel } | null {
  if (!Array.isArray(row) || row.length < 4) return null;
  const [x, y, z, col] = row;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof z !== 'number' ||
    typeof col !== 'number'
  )
    return null;
  const color = (col >>> 0) & 0xffffff;
  if (row.length >= 5 && typeof row[4] === 'string') {
    return {
      x: Math.floor(x),
      y: Math.floor(y),
      z: Math.floor(z),
      voxel: { color, material: parseVoxelMaterial(row[4]) }
    };
  }
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    z: Math.floor(z),
    voxel: normalizeLegacyVoxel(col)
  };
}

function parseFullFormat(raw: unknown): VoxelleFileFormat | null {
  const data = raw as VoxelleFileFormat;
  if (!data || typeof data.version !== 'number' || typeof data.gridSize !== 'number') return null;
  const sz = data.gridSize;
  if (sz < 1 || !Number.isInteger(sz)) return null;
  if (!Array.isArray(data.voxels)) return null;
  const voxelsArr: VoxelleFileVoxelRow[] = [];
  for (const e of data.voxels) {
    if (!Array.isArray(e) || e.length < 4 || e.length > 5) continue;
    const parsed = rowToVoxel(e as VoxelleFileVoxelRow);
    if (!parsed) continue;
    const mat = parsed.voxel.material as VoxelMaterialId;
    voxelsArr.push([parsed.x, parsed.y, parsed.z, parsed.voxel.color, mat]);
  }
  const hiddenVoxelsArr: VoxelleFileVoxelRow[] = [];
  if (Array.isArray(data.hiddenVoxels)) {
    for (const e of data.hiddenVoxels) {
      if (!Array.isArray(e) || e.length < 4 || e.length > 5) continue;
      const parsed = rowToVoxel(e as VoxelleFileVoxelRow);
      if (!parsed) continue;
      const mat = parsed.voxel.material as VoxelMaterialId;
      hiddenVoxelsArr.push([parsed.x, parsed.y, parsed.z, parsed.voxel.color, mat]);
    }
  }
  return {
    version: data.version,
    gridSize: sz,
    voxels: voxelsArr,
    hiddenVoxels: hiddenVoxelsArr,
    scene: data.scene
  };
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

/** bson `serialize` default internal buffer (~17 MiB); large models need a larger working buffer. */
const BSON_DEFAULT_INTERNAL = 1024 * 1024 * 17;
const BSON_SERIALIZE_MARGIN = 65536;

/** Serialize VoxelleFileFormat to BSON bytes. Used by worker and tests. */
export function serializeFormatToBson(data: VoxelleFileFormat): Uint8Array {
  const doc = data as Document;
  const estimated = calculateObjectSize(doc) + BSON_SERIALIZE_MARGIN;
  const minInternalBufferSize = Math.max(BSON_DEFAULT_INTERNAL, estimated);
  const bsonBytes = bsonSerialize(doc, {
    minInternalBufferSize
  } as Parameters<typeof bsonSerialize>[1] & { minInternalBufferSize: number });
  return new Uint8Array(
    bsonBytes.buffer.slice(bsonBytes.byteOffset, bsonBytes.byteOffset + bsonBytes.byteLength)
  );
}
