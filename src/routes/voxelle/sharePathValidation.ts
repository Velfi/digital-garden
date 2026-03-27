/** Share blobs are stored at `voxelle/<id>`; id must match URL param safety. */
const SHARE_ID_RE = /^[A-Za-z0-9_-]+$/;

export function isValidVoxelleSharePathname(pathname: string): boolean {
  if (!pathname.startsWith('voxelle/')) return false;
  const id = pathname.slice('voxelle/'.length);
  if (!id || id.includes('/')) return false;
  return SHARE_ID_RE.test(id);
}

export function assertValidVoxelleSharePathname(pathname: string): void {
  if (!isValidVoxelleSharePathname(pathname)) {
    throw new Error('Invalid share path');
  }
}
