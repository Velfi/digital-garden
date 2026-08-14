import { describe, expect, it } from 'vitest';
import { buildEggMesh, edgesOf, volumeOf } from './eggMesh';
import { buildSubdivision } from './subdivision';

describe('the subdivision skin', () => {
  const egg = buildEggMesh();
  const sub = buildSubdivision(egg);

  it('every weight row sums to one', () => {
    // Affine invariance: translate the coarse mesh and the skin translates
    // with it, exactly. Anything else and the skin would swim as the slime
    // moves across the box.
    for (let i = 0; i < sub.vertexCount; i++) {
      let sum = 0;
      for (let k = sub.offsets[i]; k < sub.offsets[i + 1]; k++) sum += sub.values[k];
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it('is still a closed mesh with sphere topology', () => {
    const topology = edgesOf(sub);
    expect(sub.vertexCount - topology.edges.length + sub.faceCount).toBe(2);
  });

  it('keeps outward winding and roughly the same volume', () => {
    const positions = new Float32Array(sub.vertexCount * 3);
    sub.apply(egg.positions, positions);
    const volume = volumeOf({ positions, faces: sub.faces, faceCount: sub.faceCount });
    const rest = volumeOf(egg);
    // Loop shrinks a convex-ish shape a little; it must not flip or balloon.
    expect(volume).toBeGreaterThan(rest * 0.8);
    expect(volume).toBeLessThan(rest * 1.05);
  });

  it('inherits the material split: yolk children are exactly the yolk block', () => {
    expect(sub.yolkFaceStart).toBe(egg.yolkFaceStart * 4);
    expect(sub.faceCount).toBe(egg.faceCount * 4);
  });
});
