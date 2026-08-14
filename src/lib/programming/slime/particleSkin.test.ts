import { describe, expect, it } from 'vitest';
import { FLOOR_Y } from './constants';
import { createParticleSkin } from './particleSkin';
import { createPbdWorld } from './pbdWorld';

describe('particle skin', () => {
  it('wraps the settled body smoothly, sealed to the floor', () => {
    const world = createPbdWorld();
    for (let i = 0; i < 180; i++) world.step(1 / 60);
    const positions = new Float32Array(world.particleCount * 3);
    world.readPositions(positions);

    const skin = createParticleSkin();
    // A few frames so the temporal average converges on the settled shape.
    for (let i = 0; i < 30; i++) skin.update(positions, world.particleCount);

    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < world.particleCount; i++) {
      cx += positions[i * 3];
      cy += positions[i * 3 + 1];
      cz += positions[i * 3 + 2];
    }
    cx /= world.particleCount;
    cy /= world.particleCount;
    cz /= world.particleCount;

    const geometry = skin.mesh.geometry;
    const pos = geometry.getAttribute('position');
    let minY = Infinity;
    let maxY = -Infinity;
    let minR = Infinity;
    let maxR = -Infinity;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const y = pos.getY(v);
      const z = pos.getZ(v);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const r = Math.hypot(x - cx, y - cy, z - cz);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    // A body-sized blob resting on the substrate, tucked to it — neither
    // ballooning out the bottom nor hovering above it.
    expect(maxY - minY).toBeGreaterThan(0.008);
    expect(minY).toBeGreaterThan(FLOOR_Y - 0.0006);
    expect(minY).toBeLessThanOrEqual(FLOOR_Y);
    // Every direction bin produced a healthy radius: no collapsed dimples
    // (an empty-bin bug would leave vertices at the centroid), no runaway.
    expect(minR).toBeGreaterThan(0.005);
    expect(maxR).toBeLessThan(0.05);

    // Smoothness, the point of the module: adjacent vertex normals nearly
    // parallel everywhere above the floor crease. The retired marching-cubes
    // skin failed this by a mile — per-particle warts flip normals wildly.
    const normal = geometry.getAttribute('normal');
    const index = geometry.getIndex()!;
    let worstDot = 1;
    for (let f = 0; f < index.count; f += 3) {
      for (let e = 0; e < 3; e++) {
        const a = index.getX(f + e);
        const b = index.getX(f + ((e + 1) % 3));
        if (pos.getY(a) < FLOOR_Y + 0.002 || pos.getY(b) < FLOOR_Y + 0.002) continue;
        const dot =
          normal.getX(a) * normal.getX(b) +
          normal.getY(a) * normal.getY(b) +
          normal.getZ(a) * normal.getZ(b);
        if (dot < worstDot) worstDot = dot;
      }
    }
    expect(worstDot).toBeGreaterThan(Math.cos((30 * Math.PI) / 180));

    // Temporal stability: same particles in, same skin out — the converged
    // average must not shimmer.
    const before = Float32Array.from(pos.array as Float32Array);
    skin.update(positions, world.particleCount);
    let worstDelta = 0;
    const after = pos.array as Float32Array;
    for (let i = 0; i < after.length; i++) {
      const d = Math.abs(after[i] - before[i]);
      if (d > worstDelta) worstDelta = d;
    }
    expect(worstDelta).toBeLessThan(1e-5);

    skin.dispose();
  }, 60_000);
});
