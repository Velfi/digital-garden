const SHARE_ID_RE = /^[A-Za-z0-9_-]+$/;

export function isValidBadgerSharePathname(pathname: string): boolean {
  if (!pathname.startsWith('badger/')) return false;
  const id = pathname.slice('badger/'.length);
  if (!id || id.includes('/')) return false;
  return SHARE_ID_RE.test(id);
}

export function assertValidBadgerSharePathname(pathname: string): void {
  if (!isValidBadgerSharePathname(pathname)) {
    throw new Error('Invalid share path');
  }
}
