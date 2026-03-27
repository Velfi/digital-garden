import { encodeForTransport, encodeForTransportBytes } from './voxelleFile';

export async function encodeModelForUrl(): Promise<string> {
  return encodeForTransport();
}

/** Binary share payload (gzip BSON); avoids base64 when uploading to Blob. */
export async function encodeModelBytesForUrl(): Promise<Uint8Array> {
  return encodeForTransportBytes();
}
