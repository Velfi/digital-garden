import { parseFormatPayload, serializeFormatToBson } from './voxelleFormatCore';
import type { VoxelleFileFormat } from './voxelleFormatCore';

export type ParseMessage = { type: 'parse'; id: number; bytes: ArrayBuffer };
export type SerializeMessage = { type: 'serialize'; id: number; data: VoxelleFileFormat };

export type ParsedResult = { type: 'parsed'; id: number; data: VoxelleFileFormat | null };
export type SerializedResult = { type: 'serialized'; id: number; bytes: ArrayBuffer };

/** Pure logic for voxelle file worker messages. Testable without Worker APIs. */
export function processVoxelleFileMessage(
  msg: ParseMessage | SerializeMessage
): ParsedResult | SerializedResult {
  if (msg.type === 'parse') {
    const bytes = new Uint8Array(msg.bytes);
    const data = parseFormatPayload(bytes);
    return { type: 'parsed', id: msg.id, data };
  } else {
    const bsonBytes = serializeFormatToBson(msg.data);
    const buf = bsonBytes.buffer.slice(
      bsonBytes.byteOffset,
      bsonBytes.byteOffset + bsonBytes.byteLength
    ) as ArrayBuffer;
    return { type: 'serialized', id: msg.id, bytes: buf };
  }
}
