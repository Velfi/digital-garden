import {
  calculateObjectSize,
  deserialize as bsonDeserialize,
  serialize as bsonSerialize,
  type Document
} from 'bson';
import type { Voxel, VoxelMaterialId } from '../voxelMaterial';
import {
  normalizeLegacyVoxel,
  parseVoxelMaterial,
  VOXEL_MATERIAL_IDS
} from '../voxelMaterial';
import { LARGE_PROJECT_OPEN_VOXEL_THRESHOLD } from './projectLoad';

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
      grainMode?: 'colorful' | 'monochrome';
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

/** Magic: `VX3` + 0x1a — v3 wire layout after gzip (if any). */
export const VOXELLE_V3_MAGIC = Uint8Array.from([0x56, 0x58, 0x33, 0x1a]);

/** Magic: `VX4` + 0x1a — desktop v4 container: u32 uncompressed len, u32 CRC32, gzip(inner). */
export const VOXELLE_V4_MAGIC = Uint8Array.from([0x56, 0x58, 0x34, 0x1a]);

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE / zlib); matches Rust `crc32fast::hash` used by Voxelle desktop v4. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]!) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function isV4ContainerPayload(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === VOXELLE_V4_MAGIC[0] &&
    bytes[1] === VOXELLE_V4_MAGIC[1] &&
    bytes[2] === VOXELLE_V4_MAGIC[2] &&
    bytes[3] === VOXELLE_V4_MAGIC[3]
  );
}

/** Fixed binary voxel record: xyz int32 LE, color uint32 LE, material index uint8, pad 3. */
export const VOXELLE_V3_RECORD_SIZE = 20;

export function isV3WirePayload(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === VOXELLE_V3_MAGIC[0] &&
    bytes[1] === VOXELLE_V3_MAGIC[1] &&
    bytes[2] === VOXELLE_V3_MAGIC[2] &&
    bytes[3] === VOXELLE_V3_MAGIC[3]
  );
}

function materialIndex(m: VoxelMaterialId): number {
  const i = VOXEL_MATERIAL_IDS.indexOf(m);
  return i >= 0 ? i : 0;
}

export function decodeV3WireRecord(
  bytes: Uint8Array,
  byteOffset: number
): { x: number; y: number; z: number; voxel: Voxel } | null {
  const r = readV3RecordInner(bytes, byteOffset);
  if (!r) return null;
  return {
    x: r.x,
    y: r.y,
    z: r.z,
    voxel: { color: r.color, material: r.material }
  };
}

/** `byteOffset` is an index into `bytes` (not an ArrayBuffer byte index). */
function readV3RecordInner(bytes: Uint8Array, byteOffset: number): {
  x: number;
  y: number;
  z: number;
  color: number;
  material: VoxelMaterialId;
} | null {
  if (byteOffset + VOXELLE_V3_RECORD_SIZE > bytes.byteLength) return null;
  const dv = new DataView(bytes.buffer);
  const base = bytes.byteOffset + byteOffset;
  const x = dv.getInt32(base, true);
  const y = dv.getInt32(base + 4, true);
  const z = dv.getInt32(base + 8, true);
  const color = dv.getUint32(base + 12, true) & 0xffffff;
  const mi = dv.getUint8(base + 16);
  const material =
    mi < VOXEL_MATERIAL_IDS.length ? VOXEL_MATERIAL_IDS[mi]! : VOXEL_MATERIAL_IDS[0]!;
  return { x, y, z, color, material };
}

export type V3WireHeader = {
  gridSize: number;
  scene?: VoxelleFileFormat['scene'];
  voxelCount: number;
  hiddenCount: number;
  bodyByteOffset: number;
};

/** Parse v3 header + validate body length. Returns null if invalid. */
export function parseV3WireHeader(bytes: Uint8Array): V3WireHeader | null {
  if (!isV3WirePayload(bytes) || bytes.length < 16) return null;
  const dv = new DataView(bytes.buffer);
  const b = bytes.byteOffset;
  const wireVersion = dv.getUint32(b + 4, true);
  // Desktop dense wire uses wire_version 4; web-generated v3 uses 3. Body layout is identical.
  if (wireVersion !== 3 && wireVersion !== 4) return null;
  const headerLen = dv.getUint32(b + 8, true);
  if (headerLen < 8 || 12 + headerLen > bytes.length) return null;
  const headerSlice = bytes.subarray(12, 12 + headerLen);
  let headerDoc: unknown;
  try {
    headerDoc = bsonDeserialize(headerSlice, { allowObjectSmallerThanBufferSize: true });
  } catch {
    return null;
  }
  const h = headerDoc as Record<string, unknown>;
  if (typeof h.gridSize !== 'number' || !Number.isInteger(h.gridSize) || h.gridSize < 1)
    return null;
  const voxelCount = typeof h.voxelCount === 'number' && Number.isInteger(h.voxelCount) ? h.voxelCount : -1;
  const hiddenCount =
    typeof h.hiddenCount === 'number' && Number.isInteger(h.hiddenCount) ? h.hiddenCount : -1;
  if (voxelCount < 0 || hiddenCount < 0) return null;
  const bodyLen = (voxelCount + hiddenCount) * VOXELLE_V3_RECORD_SIZE;
  if (12 + headerLen + bodyLen !== bytes.length) return null;
  return {
    gridSize: h.gridSize,
    scene: h.scene as VoxelleFileFormat['scene'] | undefined,
    voxelCount,
    hiddenCount,
    bodyByteOffset: 12 + headerLen
  };
}

function parseV3Payload(bytes: Uint8Array): VoxelleFileFormat | null {
  const head = parseV3WireHeader(bytes);
  if (!head) return null;
  const voxelsArr: VoxelleFileVoxelRow[] = [];
  let o = head.bodyByteOffset;
  for (let i = 0; i < head.voxelCount; i++) {
    const r = readV3RecordInner(bytes, o);
    if (!r) return null;
    o += VOXELLE_V3_RECORD_SIZE;
    voxelsArr.push([r.x, r.y, r.z, r.color, r.material]);
  }
  const hiddenArr: VoxelleFileVoxelRow[] = [];
  for (let i = 0; i < head.hiddenCount; i++) {
    const r = readV3RecordInner(bytes, o);
    if (!r) return null;
    o += VOXELLE_V3_RECORD_SIZE;
    hiddenArr.push([r.x, r.y, r.z, r.color, r.material]);
  }
  return {
    version: 3,
    gridSize: head.gridSize,
    voxels: voxelsArr,
    hiddenVoxels: hiddenArr,
    scene: head.scene
  };
}

function encodeV3WirePayload(data: VoxelleFileFormat): Uint8Array {
  const vox = data.voxels;
  const hid = data.hiddenVoxels ?? [];
  const headerDoc = {
    version: 3 as const,
    gridSize: data.gridSize,
    scene: data.scene,
    voxelCount: vox.length,
    hiddenCount: hid.length
  };
  const headerBson = bsonSerialize(headerDoc as Document, {
    minInternalBufferSize: 65536
  } as Parameters<typeof bsonSerialize>[1] & { minInternalBufferSize: number });
  const headerBytes = new Uint8Array(
    headerBson.buffer.slice(
      headerBson.byteOffset,
      headerBson.byteOffset + headerBson.byteLength
    )
  );
  const headerLen = headerBytes.length;
  const bodyBytes = (vox.length + hid.length) * VOXELLE_V3_RECORD_SIZE;
  const total = 12 + headerLen + bodyBytes;
  const out = new Uint8Array(total);
  out.set(VOXELLE_V3_MAGIC, 0);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  dv.setUint32(4, 3, true);
  dv.setUint32(8, headerLen, true);
  out.set(headerBytes, 12);
  let o = 12 + headerLen;
  const writeRow = (row: VoxelleFileVoxelRow) => {
    const parsed = rowToVoxel(row);
    if (!parsed) return;
    const mi = materialIndex(parsed.voxel.material as VoxelMaterialId);
    dv.setInt32(o, parsed.x, true);
    dv.setInt32(o + 4, parsed.y, true);
    dv.setInt32(o + 8, parsed.z, true);
    dv.setUint32(o + 12, parsed.voxel.color >>> 0, true);
    dv.setUint8(o + 16, mi);
    dv.setUint8(o + 17, 0);
    dv.setUint16(o + 18, 0, true);
    o += VOXELLE_V3_RECORD_SIZE;
  };
  for (const row of vox) writeRow(row);
  for (const row of hid) writeRow(row);
  return out;
}

/** Parse BSON or v3 wire payload to VoxelleFileFormat. Used by worker and tests. */
export function parseFormatPayload(bytes: Uint8Array): VoxelleFileFormat | null {
  if (isV3WirePayload(bytes)) {
    return parseV3Payload(bytes);
  }
  try {
    return parseFullFormat(bsonDeserialize(bytes, { allowObjectSmallerThanBufferSize: true }));
  } catch {
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

/**
 * BSON (v1/v2) for smaller models; compact v3 wire for large voxel counts to avoid huge BSON arrays.
 */
export function serializeFormatToWireBytes(data: VoxelleFileFormat): Uint8Array {
  const n = data.voxels.length + (data.hiddenVoxels?.length ?? 0);
  if (n >= LARGE_PROJECT_OPEN_VOXEL_THRESHOLD) {
    return encodeV3WirePayload(data);
  }
  return serializeFormatToBson(data);
}
