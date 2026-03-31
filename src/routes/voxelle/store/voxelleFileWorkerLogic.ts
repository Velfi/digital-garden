import {
  parseFormatPayload,
  serializeFormatToBson,
  serializeFormatToWireBytes
} from './voxelleFormatCore';
import type { SceneObjectFile, VoxelleFileFormat, VoxelleFileVoxelRow } from './voxelleFormatCore';
import { LARGE_PROJECT_OPEN_VOXEL_THRESHOLD } from './projectLoad';

export type ParseMessage = { type: 'parse'; id: number; bytes: ArrayBuffer };
export type SerializeMessage = { type: 'serialize'; id: number; data: VoxelleFileFormat };

/** One message the worker posts to the main thread for a parse operation. */
export type VoxelleFileParsePosted =
  | { type: 'parsed'; id: number; data: VoxelleFileFormat | null }
  | {
      type: 'parsedBatchedStart';
      id: number;
      meta: {
        version: number;
        gridSize: number;
        scene?: VoxelleFileFormat['scene'];
        objects?: SceneObjectFile[];
      };
    }
  | { type: 'parsedVoxelBatch'; id: number; rows: VoxelleFileVoxelRow[] }
  | { type: 'parsedHiddenBatch'; id: number; rows: VoxelleFileVoxelRow[] }
  | { type: 'parsedBatchedDone'; id: number };

export type SerializedResult = { type: 'serialized'; id: number; bytes: ArrayBuffer };

/** Rows per batch when total voxel rows exceed {@link LARGE_PROJECT_OPEN_VOXEL_THRESHOLD}. */
export const VOXELLE_FILE_BATCH_ROW_COUNT = 50_000;

/**
 * Build the sequence of postMessage payloads for a parse result.
 * Small models use a single `parsed` message; large models avoid one giant structured clone.
 */
export function buildParsePostedMessages(
  id: number,
  data: VoxelleFileFormat | null
): VoxelleFileParsePosted[] {
  if (!data) return [{ type: 'parsed', id, data: null }];
  const nHidden = data.hiddenVoxels?.length ?? 0;
  const total = data.voxels.length + nHidden;
  if (total <= LARGE_PROJECT_OPEN_VOXEL_THRESHOLD) {
    return [{ type: 'parsed', id, data }];
  }
  const batch = VOXELLE_FILE_BATCH_ROW_COUNT;
  const out: VoxelleFileParsePosted[] = [
    {
      type: 'parsedBatchedStart',
      id,
      meta: {
        version: data.version,
        gridSize: data.gridSize,
        scene: data.scene,
        objects: data.objects
      }
    }
  ];
  for (let i = 0; i < data.voxels.length; i += batch) {
    out.push({ type: 'parsedVoxelBatch', id, rows: data.voxels.slice(i, i + batch) });
  }
  const hid = data.hiddenVoxels ?? [];
  for (let i = 0; i < hid.length; i += batch) {
    out.push({ type: 'parsedHiddenBatch', id, rows: hid.slice(i, i + batch) });
  }
  out.push({ type: 'parsedBatchedDone', id });
  return out;
}

export type ParseMultiResult = { type: 'parseMulti'; id: number; messages: VoxelleFileParsePosted[] };

/** Pure logic for voxelle file worker messages. Testable without Worker APIs. */
export function processVoxelleFileMessage(
  msg: ParseMessage | SerializeMessage
): ParseMultiResult | SerializedResult {
  if (msg.type === 'parse') {
    const bytes = new Uint8Array(msg.bytes);
    const data = parseFormatPayload(bytes);
    return { type: 'parseMulti', id: msg.id, messages: buildParsePostedMessages(msg.id, data) };
  }
  const bsonBytes = serializeFormatToWireBytes(msg.data);
  const buf = bsonBytes.buffer.slice(
    bsonBytes.byteOffset,
    bsonBytes.byteOffset + bsonBytes.byteLength
  ) as ArrayBuffer;
  return { type: 'serialized', id: msg.id, bytes: buf };
}
