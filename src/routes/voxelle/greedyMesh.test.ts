import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildGreedyMesh, getGreedyMeshFaceArea } from './greedyMesh';
import { coordKey } from './store/index';
import { initShape } from './store/index';
import { plasticVoxel, voxelBucketKey, type Voxel } from './voxelMaterial';
import { computeTransmissionBound } from './transmissionPolicy';

function bkey(rgb: number): string {
  return voxelBucketKey(plasticVoxel(rgb));
}

function glassVoxel(color: number): Voxel {
  return { color: color & 0xffffff, material: 'glass' };
}

/** Count visible faces (no neighbor in that direction) for a voxel set. */
function countVisibleFaces(voxels: Map<string, Voxel>): number {
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
    const voxels = new Map<string, Voxel>([
      [coordKey(0, 0, 0), plasticVoxel(color)],
      [coordKey(0, 2, 1), plasticVoxel(color)],
      [coordKey(0, 1, 2), plasticVoxel(color)],
      [coordKey(0, 2, 2), plasticVoxel(color)]
    ]);
    const result = buildGreedyMesh(voxels);
    const geo = result.get(bkey(color))!;
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

      expect(colors.getX(i)).toBeCloseTo(1, 6);
      expect(colors.getY(i)).toBeCloseTo(1, 6);
      expect(colors.getZ(i)).toBeCloseTo(1, 6);
    }

    expect(seenCorners.size).toBe(4);
  });

  it('single voxel produces 6 faces (12 triangles, welded vertices)', () => {
    const voxels = new Map<string, Voxel>([[coordKey(0, 0, 0), plasticVoxel(0x888888)]]);
    const result = buildGreedyMesh(voxels);
    expect(result.size).toBe(1);
    const geo = result.get(bkey(0x888888))!;
    expect(getVertexCount(geo)).toBe(24);
    expect(getTriangleCount(geo)).toBe(12);
    expect(countVisibleFaces(voxels)).toBe(6);
  });

  it('single voxel geometry has correct face positions', () => {
    const voxels = new Map<string, Voxel>([[coordKey(0, 0, 0), plasticVoxel(0x888888)]]);
    const result = buildGreedyMesh(voxels);
    const geo = result.get(bkey(0x888888))!;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const normals = geo.getAttribute('normal') as THREE.BufferAttribute;

    const verts = new Set<string>();
    for (let i = 0; i < pos.count; i++) {
      verts.add([pos.getX(i), pos.getY(i), pos.getZ(i)].map((n) => n.toFixed(2)).join(','));
    }
    expect(verts.has('0.50,-0.50,-0.50')).toBe(true);
    expect(verts.has('-0.50,-0.50,-0.50')).toBe(true);
    expect(verts.has('-0.50,0.50,-0.50')).toBe(true);
    expect(verts.has('-0.50,-0.50,0.50')).toBe(true);

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
    const voxels = new Map<string, Voxel>([
      [coordKey(0, 0, 0), plasticVoxel(0x888888)],
      [coordKey(1, 0, 0), plasticVoxel(0x888888)]
    ]);
    expect(countVisibleFaces(voxels)).toBe(10);
    const result = buildGreedyMesh(voxels, { aoEnabled: false });
    const geo = result.get(bkey(0x888888))!;
    expect(getVertexCount(geo)).toBe(24);
  });

  it('skipMerge emits one quad per visible face (no merging)', () => {
    const voxels = new Map<string, Voxel>([
      [coordKey(0, 0, 0), plasticVoxel(0x888888)],
      [coordKey(1, 0, 0), plasticVoxel(0x888888)]
    ]);
    expect(countVisibleFaces(voxels)).toBe(10);
    const result = buildGreedyMesh(voxels, { aoEnabled: false, skipMerge: true });
    const geo = result.get(bkey(0x888888))!;
    expect(geo).toBeDefined();
    expect(getTriangleCount(geo)).toBe(20);
  });

  it('2×2×2 cube has 24 visible faces, merged to 6 quads', () => {
    const voxels = new Map<string, Voxel>();
    for (let x = 0; x < 2; x++)
      for (let y = 0; y < 2; y++)
        for (let z = 0; z < 2; z++) voxels.set(coordKey(x, y, z), plasticVoxel(0x888888));

    expect(countVisibleFaces(voxels)).toBe(24);
    const result = buildGreedyMesh(voxels, { aoEnabled: false });
    const geo = result.get(bkey(0x888888))!;
    expect(getVertexCount(geo)).toBe(24);
    expect(getTriangleCount(geo)).toBe(12);
  });

  it('initShape cube produces 6 faces (one quad per face)', () => {
    const voxels = initShape(8, 'cube');
    const result = buildGreedyMesh(voxels, { aoEnabled: false });
    expect(result.size).toBe(1);
    const geo = result.get(bkey(0x888888))!;
    expect(getTriangleCount(geo)).toBe(12);
    expect(getVertexCount(geo)).toBe(24);
  });

  it('initShape orb produces geometry with all 6 normals', () => {
    const voxels = initShape(8, 'orb');
    expect(voxels.size).toBeGreaterThan(0);
    const result = buildGreedyMesh(voxels);
    expect(result.size).toBe(1);
    const geo = result.get(bkey(0x888888))!;
    expect(getVertexCount(geo)).toBeGreaterThan(24);

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
    const geo = result.get(bkey(0x888888))!;
    expect(getVertexCount(geo)).toBeGreaterThan(24);
  });

  it('voxels with negative coordinates render correctly', () => {
    const voxels = new Map<string, Voxel>();
    for (let x = -1; x <= 0; x++)
      for (let y = -1; y <= 0; y++)
        for (let z = -1; z <= 0; z++) voxels.set(coordKey(x, y, z), plasticVoxel(0x888888));

    expect(countVisibleFaces(voxels)).toBe(24);
    const result = buildGreedyMesh(voxels, { aoEnabled: false });
    const geo = result.get(bkey(0x888888))!;
    expect(getVertexCount(geo)).toBe(24);

    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    let hasNegFace = false;
    let hasPosFace = false;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      if (x <= -0.4) hasNegFace = true;
      if (x >= 0.4) hasPosFace = true;
    }
    expect(hasNegFace).toBe(true);
    expect(hasPosFace).toBe(true);
  });

  it('plane with 1-height line and AO enabled is subdivided for smooth AO', () => {
    const voxels = new Map<string, Voxel>();
    for (let x = -1; x <= 1; x++)
      for (let z = -1; z <= 1; z++) voxels.set(coordKey(x, 0, z), plasticVoxel(0xcccccc));
    voxels.set(coordKey(-1, 1, 0), plasticVoxel(0x444444));
    voxels.set(coordKey(0, 1, 0), plasticVoxel(0x444444));
    voxels.set(coordKey(1, 1, 0), plasticVoxel(0x444444));

    const resultNoAO = buildGreedyMesh(voxels, { aoEnabled: false });
    const resultAO = buildGreedyMesh(voxels, { aoEnabled: true });
    const geoNoAO = resultNoAO.get(bkey(0xcccccc))!;
    const geoAO = resultAO.get(bkey(0xcccccc))!;

    expect(getVertexCount(geoAO)).toBeGreaterThan(getVertexCount(geoNoAO));
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
      const areaByBucket = getGreedyMeshFaceArea(voxels);
      const totalArea = [...areaByBucket.values()].reduce((a, b) => a + b, 0);
      expect(totalArea).toBe(expectedFaces);
    }
  });

  it('adjacent glass voxels cull inner faces to avoid stacked transparency', () => {
    const voxels = new Map<string, Voxel>([
      [coordKey(0, 0, 0), glassVoxel(0x88ccff)],
      [coordKey(1, 0, 0), glassVoxel(0x88ccff)]
    ]);
    const plasticPair = new Map<string, Voxel>([
      [coordKey(0, 0, 0), plasticVoxel(0x88ccff)],
      [coordKey(1, 0, 0), plasticVoxel(0x88ccff)]
    ]);
    const glassArea = [...getGreedyMeshFaceArea(voxels).values()].reduce((a, b) => a + b, 0);
    const plasticArea = [...getGreedyMeshFaceArea(plasticPair).values()].reduce((a, b) => a + b, 0);
    expect(plasticArea).toBe(10);
    expect(glassArea).toBe(10);
  });

  it('transmissive boundaries against non-matching material remain visible', () => {
    const water = new Map<string, Voxel>([[coordKey(0, 0, 0), { color: 0x2288ff, material: 'water' }]]);
    const waterWithGlassNeighbor = new Map<string, Voxel>([
      [coordKey(0, 0, 0), { color: 0x2288ff, material: 'water' }],
      [coordKey(1, 0, 0), { color: 0xaad7ff, material: 'glass' }]
    ]);
    const isolatedArea = [...getGreedyMeshFaceArea(water).values()].reduce((a, b) => a + b, 0);
    const withNeighborArea = [...getGreedyMeshFaceArea(waterWithGlassNeighbor).values()].reduce(
      (a, b) => a + b,
      0
    );
    // Combined visible area should include both bucket boundaries (not collapse to top-only surfaces).
    expect(withNeighborArea).toBeGreaterThan(isolatedArea);
  });

  it('glass darkens as contiguous thickness increases', () => {
    const thin = new Map<string, Voxel>([[coordKey(0, 0, 0), glassVoxel(0x88ccff)]]);
    const thick = new Map<string, Voxel>([
      [coordKey(0, 0, 0), glassVoxel(0x88ccff)],
      [coordKey(1, 0, 0), glassVoxel(0x88ccff)],
      [coordKey(2, 0, 0), glassVoxel(0x88ccff)]
    ]);

    const thinGeo = buildGreedyMesh(thin).get(voxelBucketKey(glassVoxel(0x88ccff)))!;
    const thickGeo = buildGreedyMesh(thick).get(voxelBucketKey(glassVoxel(0x88ccff)))!;
    const thinColors = thinGeo.getAttribute('color') as THREE.BufferAttribute;
    const thickColors = thickGeo.getAttribute('color') as THREE.BufferAttribute;

    const minChannel = (attr: THREE.BufferAttribute): number => {
      let min = 1;
      for (let i = 0; i < attr.count; i++) {
        min = Math.min(min, attr.getX(i), attr.getY(i), attr.getZ(i));
      }
      return min;
    };

    expect(minChannel(thinColors)).toBeCloseTo((0x88 / 255) * computeTransmissionBound(0x88ccff, 'glass', 1), 6);
    expect(minChannel(thickColors)).toBeLessThan(minChannel(thinColors));
  });

  it('separate colors produce separate geometries', () => {
    const voxels = new Map<string, Voxel>([
      [coordKey(0, 0, 0), plasticVoxel(0xff0000)],
      [coordKey(2, 0, 0), plasticVoxel(0x00ff00)]
    ]);
    const result = buildGreedyMesh(voxels);
    expect(result.size).toBe(2);
    expect(result.has(bkey(0xff0000))).toBe(true);
    expect(result.has(bkey(0x00ff00))).toBe(true);
    expect(getVertexCount(result.get(bkey(0xff0000))!)).toBe(24);
    expect(getVertexCount(result.get(bkey(0x00ff00))!)).toBe(24);
  });
});
