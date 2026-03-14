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

function parsePayload(bytes: Uint8Array): VoxelleFileFormat | null {
  const isJson = bytes[0] === 0x7b; // '{'
  try {
    if (isJson) {
      return parseFullFormat(JSON.parse(new TextDecoder().decode(bytes)));
    }
    return parseFullFormat(bsonDeserialize(bytes));
  } catch {
    return null;
  }
}

type ParseMessage = { type: 'parse'; id: number; bytes: ArrayBuffer };
type SerializeMessage = { type: 'serialize'; id: number; data: VoxelleFileFormat };

self.onmessage = (
  e: MessageEvent<ParseMessage | SerializeMessage>
) => {
  const msg = e.data;
  if (msg.type === 'parse') {
    const bytes = new Uint8Array(msg.bytes);
    const data = parsePayload(bytes);
    self.postMessage({ type: 'parsed', id: msg.id, data });
  } else if (msg.type === 'serialize') {
    const bsonBytes = bsonSerialize(msg.data);
    const buf = bsonBytes.buffer.slice(
      bsonBytes.byteOffset,
      bsonBytes.byteOffset + bsonBytes.byteLength
    );
    self.postMessage({ type: 'serialized', id: msg.id, bytes: buf }, { transfer: [buf] });
  }
};
