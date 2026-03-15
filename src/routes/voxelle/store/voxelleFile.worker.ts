import {
  parseFormatPayload,
  serializeFormatToBson,
  type VoxelleFileFormat
} from './voxelleFormatCore';

export type { VoxelleFileFormat };

type ParseMessage = { type: 'parse'; id: number; bytes: ArrayBuffer };
type SerializeMessage = { type: 'serialize'; id: number; data: VoxelleFileFormat };

self.onmessage = (
  e: MessageEvent<ParseMessage | SerializeMessage>
) => {
  const msg = e.data;
  if (msg.type === 'parse') {
    const bytes = new Uint8Array(msg.bytes);
    const data = parseFormatPayload(bytes);
    self.postMessage({ type: 'parsed', id: msg.id, data });
  } else if (msg.type === 'serialize') {
    const bsonBytes = serializeFormatToBson(msg.data);
    const buf = bsonBytes.buffer.slice(
      bsonBytes.byteOffset,
      bsonBytes.byteOffset + bsonBytes.byteLength
    );
    self.postMessage({ type: 'serialized', id: msg.id, bytes: buf }, { transfer: [buf] });
  }
};
