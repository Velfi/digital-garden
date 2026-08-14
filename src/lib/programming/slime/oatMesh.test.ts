import { describe, expect, it } from 'vitest';
import { buildOatGeometry, createOatMaterial } from './oatMesh';

describe('the oat flake geometry', () => {
  it('is deterministic per seed, and different across seeds', () => {
    const a = buildOatGeometry(12).geometry.getAttribute('position');
    const b = buildOatGeometry(12).geometry.getAttribute('position');
    const c = buildOatGeometry(13).geometry.getAttribute('position');
    expect(b.count).toBe(a.count);
    let same = true;
    let differs = false;
    for (let i = 0; i < a.count * 3; i++) {
      if ((a.array as Float32Array)[i] !== (b.array as Float32Array)[i]) same = false;
      if ((a.array as Float32Array)[i] !== (c.array as Float32Array)[i]) differs = true;
    }
    expect(same).toBe(true);
    expect(differs).toBe(true);
  });

  it('stays flake-sized, flake-thin, and finite', () => {
    for (const seed of [1, 7, 99]) {
      const { geometry } = buildOatGeometry(seed);
      const positions = geometry.getAttribute('position');
      let maxR = 0;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        expect(Number.isFinite(x + y + z)).toBe(true);
        maxR = Math.max(maxR, Math.hypot(x, z));
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      // A rolled oat: a few millimetres across, well under two thick.
      expect(maxR).toBeGreaterThan(0.002);
      expect(maxR).toBeLessThan(0.0042);
      expect(maxY - minY).toBeGreaterThan(0.0004);
      expect(maxY - minY).toBeLessThan(0.002);
      // Normals exist and are finite (computeVertexNormals ran and the
      // degenerate centre fan did not poison them).
      const normals = geometry.getAttribute('normal');
      for (let i = 0; i < normals.count; i++) {
        expect(Number.isFinite(normals.getX(i) + normals.getY(i) + normals.getZ(i))).toBe(true);
      }
    }
  });
});

describe('the oat material', () => {
  it('exposes live digest and mold uniforms', () => {
    const oat = createOatMaterial();
    expect(oat.digest.value).toBe(0);
    expect(oat.mold.value).toBe(0);
    oat.digest.value = 0.5;
    oat.mold.value = 1;
    expect(oat.digest.value).toBe(0.5);
    expect(oat.mold.value).toBe(1);
    oat.dispose();
  });
});
