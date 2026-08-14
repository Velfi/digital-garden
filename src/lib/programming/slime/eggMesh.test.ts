import { describe, expect, it } from 'vitest';
import {
  REGION_BOTTOM,
  REGION_WHITE,
  REGION_YOLK,
  buildEggMesh,
  edgesOf,
  volumeOf
} from './eggMesh';

/**
 * The shape is the contract between the physics and the render, so the tests
 * pin the properties both sides lean on: watertightness (pressure needs a
 * closed surface), winding (pressure pushes along face normals — inward-wound
 * faces would inflate the egg into a raisin), and the region partition (the
 * stiffness tables index by region).
 */

describe('the egg mesh', () => {
  const egg = buildEggMesh();

  it('is closed: every edge is shared by exactly two faces', () => {
    // edgesOf throws on any edge with one face or three; reaching the
    // assertion at all is most of the test.
    const topology = edgesOf(egg);
    expect(topology.edges.length).toBeGreaterThan(0);
    expect(topology.opposites.length).toBe(topology.edges.length);
  });

  it('has the topology of a sphere', () => {
    const { edges } = edgesOf(egg);
    // Euler characteristic V - E + F = 2, which for a closed mesh built by
    // revolution is the whole story: no stray vertices, no pinched seam.
    expect(egg.vertexCount - edges.length + egg.faceCount).toBe(2);
  });

  it('encloses a positive, egg-sized volume', () => {
    const volume = volumeOf(egg);
    // Positive proves outward winding. The bracket pins the scale the pressure
    // constants are calibrated against — a centimetre blob, not a metre one.
    expect(volume).toBeGreaterThan(0.6e-5);
    expect(volume).toBeLessThan(2.5e-5);
  });

  it('tags every vertex with a region the stiffness tables know', () => {
    const seen = new Set<number>();
    for (const region of egg.regions) seen.add(region);
    expect([...seen].sort()).toEqual([REGION_WHITE, REGION_YOLK, REGION_BOTTOM].sort());
  });

  it('splits faces so the yolk group is exactly the all-yolk faces', () => {
    for (let f = 0; f < egg.faceCount; f++) {
      const allYolk = [0, 1, 2].every(
        (corner) => egg.regions[egg.faces[f * 3 + corner]] === REGION_YOLK
      );
      expect(allYolk).toBe(f >= egg.yolkFaceStart);
    }
  });

  it('rests on its bottom: the lowest vertices are bottom-region', () => {
    let lowest = Infinity;
    let lowestRegion = -1;
    for (let i = 0; i < egg.vertexCount; i++) {
      const y = egg.positions[i * 3 + 1];
      if (y < lowest) {
        lowest = y;
        lowestRegion = egg.regions[i];
      }
    }
    expect(lowestRegion).toBe(REGION_BOTTOM);
    // And the resting plane is y = 0, which is what lets the scene spawn the
    // body at floor height.
    expect(lowest).toBeGreaterThanOrEqual(0);
    expect(lowest).toBeLessThan(0.001);
  });
});
