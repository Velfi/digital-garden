import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildGreedyMesh, getGreedyMeshFaceArea } from './greedyMesh';
import { coordKey } from './store';
import { initShape } from './store';

/** Count visible faces (no neighbor in that direction) for a voxel set. */
function countVisibleFaces(voxels: Map<string, number>): number {
  const set = new Set(voxels.keys());
  let count = 0;
  const dirs: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1]
  ];
  for (const key of voxels.keys()) {
    const [x, y, z] = key.split(',').map(Number);
    for (const [dx, dy, dz] of dirs) {
      const nk = coordKey(x + dx, y + dy, z + dz);
      if (!set.has(nk)) count++;
    }
  }
  return count;
}

/** Get unique vertex count from geometry. */
function getVertexCount(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  return pos ? pos.count : 0;
}

/** Get triangle count (indexed or non-indexed). */
function getTriangleCount(geo: THREE.BufferGeometry): number {
  const idx = geo.getIndex();
  return idx ? idx.count / 3 : (geo.getAttribute('position')?.count ?? 0) / 3;
}

describe('buildGreedyMesh', () => {
  it('AO ignores coplanar interior-slice voxels for +X face corners', () => {
    const color = 0xffffff;
    const voxels = new Map<string, number>([
      // Target voxel whose +X face should stay fully lit.
      [coordKey(0, 0, 0), color],
      // These voxels only exist on the source voxel depth slice (x=0).
      // If AO sampling ignores face sign and samples depth=x instead of x+1,
      // they incorrectly darken one +X corner of the target voxel.
      [coordKey(0, 2, 1), color],
      [coordKey(0, 1, 2), color],
      [coordKey(0, 2, 2), color]
    ]);
    const result = buildGreedyMesh(voxels);
    const geo = result.get(color)!;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const normals = geo.getAttribute('normal') as THREE.BufferAttribute;
    const colors = geo.getAttribute('color') as THREE.BufferAttribute;

    const expectedCorners = new Set([
      '0.50,-0.50,-0.50',
      '0.50,0.50,-0.50',
      '0.50,0.50,0.50',
      '0.50,-0.50,0.50'
    ]);
    const seenCorners = new Set<string>();

    for (let i = 0; i < pos.count; i++) {
      const isPlusX =
        Math.round(normals.getX(i)) === 1 &&
        Math.round(normals.getY(i)) === 0 &&
        Math.round(normals.getZ(i)) === 0;
      if (!isPlusX) continue;
      const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((n) => n.toFixed(2)).join(',');
      if (!expectedCorners.has(key)) continue;
      seenCorners.add(key);

      // White base color should remain white when AO samples exterior slice.
      expect(colors.getX(i)).toBeCloseTo(1, 6);
      expect(colors.getY(i)).toBeCloseTo(1, 6);
      expect(colors.getZ(i)).toBeCloseTo(1, 6);
    }

    expect(seenCorners.size).toBe(4);
  });

  it('single voxel produces 6 faces (12 triangles, welded vertices)', () => {
    const voxels = new Map<string, number>([[coordKey(0, 0, 0), 0x888888]]);
    const result = buildGreedyMesh(voxels);
    expect(result.size).toBe(1);
    const geo = result.get(0x888888)!;
    // 6 faces × 4 unique corners each = 24 vertices (vertex welding)
    expect(getVertexCount(geo)).toBe(24);
    expect(getTriangleCount(geo)).toBe(12);
    expect(countVisibleFaces(voxels)).toBe(6);
  });

  it('single voxel geometry has correct face positions', () => {
    const voxels = new Map<string, number>([[coordKey(0, 0, 0), 0x888888]]);
    const result = buildGreedyMesh(voxels);
    const geo = result.get(0x888888)!;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const normals = geo.getAttribute('normal') as THREE.BufferAttribute;

    // Should have vertices at ±0.5 on each axis (cube faces)
    const verts = new Set<string>();
    for (let i = 0; i < pos.count; i++) {
      verts.add([pos.getX(i), pos.getY(i), pos.getZ(i)].map((n) => n.toFixed(2)).join(','));
    }
    // 8 corners of cube: (±0.5, ±0.5, ±0.5)
    expect(verts.has('0.50,-0.50,-0.50')).toBe(true); // +X face
    expect(verts.has('-0.50,-0.50,-0.50')).toBe(true); // -X face
    expect(verts.has('-0.50,0.50,-0.50')).toBe(true); // +Y face
    expect(verts.has('-0.50,-0.50,0.50')).toBe(true); // +Z face

    // Should have all 6 normals
    const normalSet = new Set<string>();
    for (let i = 0; i < normals.count; i++) {
      normalSet.add(
        [normals.getX(i), normals.getY(i), normals.getZ(i)].map((n) => Math.round(n)).join(',')
      );
    }
    expect(normalSet.size).toBe(6);
    expect(normalSet.has('1,0,0')).toBe(true);
    expect(normalSet.has('-1,0,0')).toBe(true);
    expect(normalSet.has('0,1,0')).toBe(true);
    expect(normalSet.has('0,-1,0')).toBe(true);
    expect(normalSet.has('0,0,1')).toBe(true);
    expect(normalSet.has('0,0,-1')).toBe(true);
  });

  it('two adjacent voxels share a face (10 visible, merge to 6 quads)', () => {
    const voxels = new Map<string, number>([
      [coordKey(0, 0, 0), 0x888888],
      [coordKey(1, 0, 0), 0x888888]
    ]);
    expect(countVisibleFaces(voxels)).toBe(10);
    const result = buildGreedyMesh(voxels, { aoEnabled: false });
    const geo = result.get(0x888888)!;
    // 6 quads = 12 tris; vertex welding reduces to 24 unique verts
    expect(getVertexCount(geo)).toBe(24);
  });

  it('skipMerge emits one quad per visible face (no merging)', () => {
    const voxels = new Map<string, number>([
      [coordKey(0, 0, 0), 0x888888],
      [coordKey(1, 0, 0), 0x888888]
    ]);
    expect(countVisibleFaces(voxels)).toBe(10);
    const result = buildGreedyMesh(voxels, { aoEnabled: false, skipMerge: true });
    const geo = result.get(0x888888)!;
    expect(geo).toBeDefined();
    // 10 faces = 10 quads = 20 tris
    expect(getTriangleCount(geo)).toBe(20);
  });

  it('2×2×2 cube has 24 visible faces, merged to 6 quads', () => {
    const voxels = new Map<string, number>();
    for (let x = 0; x < 2; x++)
      for (let y = 0; y < 2; y++)
        for (let z = 0; z < 2; z++) voxels.set(coordKey(x, y, z), 0x888888);

    expect(countVisibleFaces(voxels)).toBe(24);
    const result = buildGreedyMesh(voxels, { aoEnabled: false });
    const geo = result.get(0x888888)!;
    // 6 faces × 2 triangles each = 12 tris; vertex welding = 24 unique verts
    expect(getVertexCount(geo)).toBe(24);
    expect(getTriangleCount(geo)).toBe(12);
  });

  it('initShape cube produces 6 faces (one quad per face)', () => {
    const voxels = initShape(8, 'cube');
    const result = buildGreedyMesh(voxels, { aoEnabled: false });
    expect(result.size).toBe(1);
    const geo = result.get(0x888888)!;
    // 8×8×8 cube: 6 faces, each 8×8 merged to one quad = 6 quads = 12 tris
    expect(getTriangleCount(geo)).toBe(12);
    expect(getVertexCount(geo)).toBe(24); // vertex welding
  });

  it('initShape orb produces geometry with all 6 normals', () => {
    const voxels = initShape(8, 'orb');
    expect(voxels.size).toBeGreaterThan(0);
    const result = buildGreedyMesh(voxels);
    expect(result.size).toBe(1);
    const geo = result.get(0x888888)!;
    expect(getVertexCount(geo)).toBeGreaterThan(24); // more than single voxel

    const normals = geo.getAttribute('normal') as THREE.BufferAttribute;
    const normalSet = new Set<string>();
    for (let i = 0; i < normals.count; i++) {
      normalSet.add(
        [normals.getX(i), normals.getY(i), normals.getZ(i)].map((n) => Math.round(n)).join(',')
      );
    }
    expect(normalSet.size).toBe(6);
  });

  it('initShape cylinder produces geometry', () => {
    const voxels = initShape(8, 'cylinder');
    const result = buildGreedyMesh(voxels);
    const geo = result.get(0x888888)!;
    // Cylinder has curved sides + 2 circular caps
    expect(getVertexCount(geo)).toBeGreaterThan(24);
  });

  it('voxels with negative coordinates render correctly', () => {
    // Centered 2×2×2 around origin: (-1,-1,-1) to (0,0,0)
    const voxels = new Map<string, number>();
    for (let x = -1; x <= 0; x++)
      for (let y = -1; y <= 0; y++)
        for (let z = -1; z <= 0; z++) voxels.set(coordKey(x, y, z), 0x888888);

    expect(countVisibleFaces(voxels)).toBe(24);
    const result = buildGreedyMesh(voxels, { aoEnabled: false });
    const geo = result.get(0x888888)!;
    expect(getVertexCount(geo)).toBe(24); // vertex welding

    // Check we have faces at the expected positions
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    let hasNegFace = false;
    let hasPosFace = false;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      if (x <= -0.4) hasNegFace = true;
      if (x >= 0.4) hasPosFace = true;
    }
    expect(hasNegFace).toBe(true); // -X face at x=-1.5
    expect(hasPosFace).toBe(true); // +X face at x=0.5
  });

  it('plane with 1-height line and AO enabled is subdivided for smooth AO', () => {
    // Flat plane at y=0 (one voxel thick), 3×3; 1-height line on top at y=1 along one edge
    const voxels = new Map<string, number>();
    for (let x = -1; x <= 1; x++)
      for (let z = -1; z <= 1; z++) voxels.set(coordKey(x, 0, z), 0xcccccc);
    voxels.set(coordKey(-1, 1, 0), 0x444444);
    voxels.set(coordKey(0, 1, 0), 0x444444);
    voxels.set(coordKey(1, 1, 0), 0x444444);

    const resultNoAO = buildGreedyMesh(voxels, { aoEnabled: false });
    const resultAO = buildGreedyMesh(voxels, { aoEnabled: true });
    const geoNoAO = resultNoAO.get(0xcccccc)!;
    const geoAO = resultAO.get(0xcccccc)!;

    // With AO off, plane top is one merged quad (9 cells) = 4 verts (welded). With AO on, quad is subdivided.
    expect(getVertexCount(geoAO)).toBeGreaterThan(getVertexCount(geoNoAO));
    // Plane top face vertices should have varying color (AO darkens under the line)
    const colors = geoAO.getAttribute('color') as THREE.BufferAttribute;
    let minC = 1;
    let maxC = 0;
    for (let i = 0; i < colors.count; i++) {
      const c = colors.getX(i);
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
    expect(maxC - minC).toBeGreaterThan(0.01);
  });

  it('empty voxels returns empty map', () => {
    const result = buildGreedyMesh(new Map());
    expect(result.size).toBe(0);
  });

  it('total quad area equals visible face count (no faces lost)', () => {
    for (const shape of ['cube', 'orb', 'cylinder', 'hollowCube', 'plane', 'circle'] as const) {
      const voxels = initShape(8, shape);
      if (voxels.size === 0) continue;
      const expectedFaces = countVisibleFaces(voxels);
      const areaByColor = getGreedyMeshFaceArea(voxels);
      const totalArea = [...areaByColor.values()].reduce((a, b) => a + b, 0);
      expect(totalArea).toBe(expectedFaces);
    }
  });

  it('separate colors produce separate geometries', () => {
    const voxels = new Map<string, number>([
      [coordKey(0, 0, 0), 0xff0000],
      [coordKey(2, 0, 0), 0x00ff00]
    ]);
    const result = buildGreedyMesh(voxels);
    expect(result.size).toBe(2);
    expect(result.has(0xff0000)).toBe(true);
    expect(result.has(0x00ff00)).toBe(true);
    // Each single voxel = 24 vertices (welded)
    expect(getVertexCount(result.get(0xff0000)!)).toBe(24);
    expect(getVertexCount(result.get(0x00ff00)!)).toBe(24);
  });
});
