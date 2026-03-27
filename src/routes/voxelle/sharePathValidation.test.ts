import { describe, it, expect } from 'vitest';
import { isValidVoxelleSharePathname, assertValidVoxelleSharePathname } from './sharePathValidation';

describe('sharePathValidation', () => {
  it('accepts voxelle/<nanoid-like id>', () => {
    expect(isValidVoxelleSharePathname('voxelle/abc123XYZ-_')).toBe(true);
    expect(() => assertValidVoxelleSharePathname('voxelle/abc123XYZ-_')).not.toThrow();
  });

  it('rejects wrong prefix, slashes in id, or empty id', () => {
    expect(isValidVoxelleSharePathname('other/abc')).toBe(false);
    expect(isValidVoxelleSharePathname('voxelle/')).toBe(false);
    expect(isValidVoxelleSharePathname('voxelle/a/b')).toBe(false);
    expect(() => assertValidVoxelleSharePathname('voxelle/../x')).toThrow();
  });
});
