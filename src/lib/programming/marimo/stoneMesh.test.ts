import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { STONE_POP_OVERSHOOT } from './constants';
import { buildStoneGeometry, measureStone, popEase, popTransform, spawnHeight } from './stoneMesh';
import { STONE_KINDS, makeStone, stoneSurface } from './stones';
import { WATER_Y } from './constants';

describe('buildStoneGeometry', () => {
  it('puts every vertex on the surface the shape describes', () => {
    // The geometry and the collision ellipsoid and the sticker all read the
    // same function; this is the check that the mesh has not drifted off it.
    const stone = makeStone(STONE_KINDS[2], 2024);
    const { geometry } = buildStoneGeometry(stone);
    const positions = geometry.getAttribute('position');
    const point: [number, number, number] = [0, 0, 0];
    const dir = new THREE.Vector3();

    for (let i = 0; i < positions.count; i += 37) {
      dir.fromBufferAttribute(positions, i);
      const built = dir.clone();
      // Back out the direction this vertex came from. The shape is star-shaped
      // about the origin, so the direction of the point is the direction it was
      // evaluated at — up to the ellipsoid, which is undone here.
      dir.set(dir.x / stone.axes[0], dir.y / stone.axes[1], dir.z / stone.axes[2]).normalize();
      stoneSurface(stone, dir.x, dir.y, dir.z, point);
      expect(built.length()).toBeCloseTo(Math.hypot(point[0], point[1], point[2]), 6);
    }
    geometry.dispose();
  });

  it('gives every vertex an outward unit normal', () => {
    const stone = makeStone(STONE_KINDS[7], 31);
    const { geometry } = buildStoneGeometry(stone);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();

    expect(normals.count).toBe(positions.count);
    for (let i = 0; i < normals.count; i += 13) {
      p.fromBufferAttribute(positions, i);
      n.fromBufferAttribute(normals, i);
      expect(n.length()).toBeCloseTo(1, 4);
      // A river stone is convex enough that no normal should point back at the
      // middle of it; one that does is a cross product with its sign flipped.
      expect(n.dot(p.normalize())).toBeGreaterThan(0);
    }
    geometry.dispose();
  });

  it('carries a colour and a gloss per vertex', () => {
    const kind = STONE_KINDS[4];
    const { geometry } = buildStoneGeometry(makeStone(kind, 8));
    const colours = geometry.getAttribute('aStoneColour');
    expect(colours.itemSize).toBe(4);
    for (let i = 0; i < colours.count; i += 29) {
      // Float32, so the gloss comes back to single precision, not exactly.
      expect(colours.getW(i)).toBeCloseTo(kind.gloss, 6);
      for (const channel of [colours.getX(i), colours.getY(i), colours.getZ(i)]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
    geometry.dispose();
  });

  it('measures extents that actually contain the stone', () => {
    for (const kind of STONE_KINDS) {
      const stone = makeStone(kind, 5150);
      const { geometry, extents } = buildStoneGeometry(stone);
      const positions = geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        expect(Math.abs(positions.getX(i))).toBeLessThanOrEqual(extents[0] + 1e-9);
        expect(Math.abs(positions.getY(i))).toBeLessThanOrEqual(extents[1] + 1e-9);
        expect(Math.abs(positions.getZ(i))).toBeLessThanOrEqual(extents[2] + 1e-9);
      }
      // Still flatter than it is wide, even after the faces have been cut.
      // The physics does not depend on this any more — a stone can come to rest
      // any way up now — but the placement footprint would be a poor guess if a
      // kind ever came out taller than it is broad.
      expect(extents[1]).toBeLessThan(Math.max(extents[0], extents[2]));
      geometry.dispose();
    }
  });

  it('measures a stone without building it, near enough for placement', () => {
    // `measureStone` samples a couple of hundred directions where the geometry
    // walks fifteen thousand of them, so the two land a fraction apart in
    // whichever direction the sampling happened to favour. Placement is the
    // only caller and it has a wall margin an order of magnitude wider than
    // this, so agreement to a per cent is agreement.
    for (const kind of STONE_KINDS) {
      const stone = makeStone(kind, 606);
      const sampled = measureStone(stone);
      const built = buildStoneGeometry(stone);
      for (let axis = 0; axis < 3; axis++) {
        expect(sampled[axis]).toBeCloseTo(built.extents[axis], 3);
      }
      built.geometry.dispose();
    }
  });
});

describe('popEase', () => {
  it('starts at nothing and ends at exactly full size', () => {
    expect(popEase(0)).toBe(0);
    expect(popEase(1)).toBe(1);
    expect(popEase(0.999)).toBeCloseTo(1, 2);
  });

  it('goes past full size on the way, which is the pop', () => {
    let peak = 0;
    for (let t = 0; t <= 1; t += 0.01) peak = Math.max(peak, popEase(t));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1 + STONE_POP_OVERSHOOT * 1.6);
  });
});

describe('popTransform', () => {
  const rest = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7);
  const origin = { screenScale: 4, forward: new THREE.Vector3(0, 0, -1) };

  it('starts as a flat sticker facing the camera', () => {
    const mesh = new THREE.Object3D();
    popTransform(mesh, rest, origin, 0);

    // Sticker-sized...
    expect(mesh.scale.x).toBeCloseTo(4, 6);
    // ...and paper-thin along the axis the camera is looking down.
    const thin = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
    expect(Math.abs(thin.dot(origin.forward))).toBeCloseTo(1, 5);
    expect(mesh.scale.y / mesh.scale.x).toBeLessThan(0.06);
  });

  it('ends as the stone, in its own pose and at its own size', () => {
    const mesh = new THREE.Object3D();
    popTransform(mesh, rest, origin, 1);
    expect(mesh.scale.x).toBeCloseTo(1, 6);
    expect(mesh.scale.y).toBeCloseTo(1, 6);
    expect(mesh.scale.z).toBeCloseTo(1, 6);
    expect(mesh.quaternion.angleTo(rest)).toBeCloseTo(0, 6);
  });

  it('never turns the stone inside out on the way', () => {
    const mesh = new THREE.Object3D();
    for (let t = 0; t <= 1; t += 0.02) {
      popTransform(mesh, rest, origin, t);
      expect(mesh.scale.x).toBeGreaterThan(0);
      expect(mesh.scale.y).toBeGreaterThan(0);
      expect(mesh.scale.z).toBeGreaterThan(0);
    }
  });
});

describe('spawnHeight', () => {
  it('starts a stone in the surface, where the pop can be seen', () => {
    // Not above it. There is almost no air in shot over the waterline, so a
    // stone dropped in from a height pops in off the top of the picture — see
    // `STONE_SPAWN_HEIGHT`. It has to be at the line, or within a hair of it.
    expect(spawnHeight(WATER_Y)).toBeCloseTo(WATER_Y, 3);
    expect(spawnHeight(WATER_Y)).toBeGreaterThanOrEqual(WATER_Y);
  });

  it('follows the waterline down during a water change', () => {
    expect(spawnHeight(WATER_Y - 0.02)).toBeCloseTo(WATER_Y - 0.02, 3);
  });
});
