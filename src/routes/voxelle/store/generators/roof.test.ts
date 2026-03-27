import { describe, it, expect } from 'vitest';
import { generateRoofVoxels } from './roof';
import { ROOF_PROFILE_CURVE_DEFAULT } from './roofProfileCurve';

const squareY0: [number, number, number][] = [
  [0, 0, 0],
  [3, 0, 0],
  [3, 0, 3],
  [0, 0, 3]
];

describe('generateRoofVoxels', () => {
  it('returns empty for fewer than 4 points', () => {
    const m = generateRoofVoxels(
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 0, 1]
      ],
      [0, 1, 0],
      {
        style: 'flat',
        height: 4,
        thickness: 2,
        shedEdgeIndex: 0,
        color: 0x888888
      }
    );
    expect(m.size).toBe(0);
  });

  it('returns empty when vertices are not coplanar', () => {
    const m = generateRoofVoxels(
      [
        [0, 0, 0],
        [2, 0, 0],
        [2, 0, 2],
        [0, 1, 0]
      ],
      [0, 1, 0],
      {
        style: 'flat',
        height: 4,
        thickness: 2,
        shedEdgeIndex: 0,
        color: 0x888888
      }
    );
    expect(m.size).toBe(0);
  });

  it('flat roof extrudes footprint by thickness along placement normal', () => {
    const m = generateRoofVoxels(squareY0, [0, 1, 0], {
      style: 'flat',
      height: 1,
      thickness: 2,
      shedEdgeIndex: 0,
      color: 0x112233
    });
    expect(m.size).toBe(32);
    expect(m.get('0,0,0')?.color).toBe(0x112233);
    expect(m.get('0,1,0')?.color).toBe(0x112233);
    expect(m.has('0,2,0')).toBe(false);
  });

  it('footprintFromShape matches filled polygon square for flat roof', () => {
    const filled: [number, number, number][] = [];
    for (let x = 0; x <= 3; x++) for (let z = 0; z <= 3; z++) filled.push([x, 0, z]);
    const fromShape = generateRoofVoxels([], [0, 1, 0], {
      style: 'flat',
      height: 1,
      thickness: 2,
      shedEdgeIndex: 0,
      color: 0x112233,
      footprintFromShape: filled
    });
    const fromPoly = generateRoofVoxels(squareY0, [0, 1, 0], {
      style: 'flat',
      height: 1,
      thickness: 2,
      shedEdgeIndex: 0,
      color: 0x112233
    });
    expect(fromShape.size).toBe(fromPoly.size);
  });

  it('custom_profile with default ramp matches pyramid on a square', () => {
    const pyr = generateRoofVoxels(squareY0, [0, 1, 0], {
      style: 'pyramid',
      height: 4,
      thickness: 1,
      shedEdgeIndex: 0,
      color: 0x888888
    });
    const custom = generateRoofVoxels(squareY0, [0, 1, 0], {
      style: 'custom_profile',
      height: 4,
      thickness: 1,
      shedEdgeIndex: 0,
      color: 0x888888,
      profileCurve: ROOF_PROFILE_CURVE_DEFAULT
    });
    expect(custom.size).toBe(pyr.size);
  });

  it('pyramid produces more voxels than footprint alone', () => {
    const flat = generateRoofVoxels(squareY0, [0, 1, 0], {
      style: 'flat',
      height: 1,
      thickness: 1,
      shedEdgeIndex: 0,
      color: 0x888888
    });
    const pyr = generateRoofVoxels(squareY0, [0, 1, 0], {
      style: 'pyramid',
      height: 4,
      thickness: 1,
      shedEdgeIndex: 0,
      color: 0x888888
    });
    expect(flat.size).toBe(16);
    expect(pyr.size).toBeGreaterThan(16);
    expect(pyr.size).toBeLessThan(2000);
  });

  it('hollow keeps a smaller shell than solid for a thick flat slab', () => {
    const base = {
      style: 'flat' as const,
      height: 1,
      thickness: 6,
      shedEdgeIndex: 0,
      color: 0x888888
    };
    const solid = generateRoofVoxels(squareY0, [0, 1, 0], { ...base, hollow: false });
    const hollow = generateRoofVoxels(squareY0, [0, 1, 0], { ...base, hollow: true });
    expect(hollow.size).toBeLessThan(solid.size);
    expect(hollow.size).toBeGreaterThan(20);
  });

  it('shed and gable return non-empty maps for a square', () => {
    const shed = generateRoofVoxels(squareY0, [0, 1, 0], {
      style: 'shed',
      height: 3,
      thickness: 1,
      shedEdgeIndex: 0,
      color: 0x888888
    });
    const gable = generateRoofVoxels(squareY0, [0, 1, 0], {
      style: 'gable',
      height: 3,
      thickness: 1,
      shedEdgeIndex: 0,
      color: 0x888888
    });
    expect(shed.size).toBeGreaterThanOrEqual(16);
    expect(gable.size).toBeGreaterThanOrEqual(16);
  });

  it('gable orientation 1 vs 2 can differ on a non-square rectangle', () => {
    const rect: [number, number, number][] = [
      [0, 0, 0],
      [5, 0, 0],
      [5, 0, 2],
      [0, 0, 2]
    ];
    const base = {
      style: 'gable' as const,
      height: 4,
      thickness: 1,
      shedEdgeIndex: 0,
      color: 0x888888
    };
    const gU = generateRoofVoxels(rect, [0, 1, 0], { ...base, gableOrientation: 1 });
    const gV = generateRoofVoxels(rect, [0, 1, 0], { ...base, gableOrientation: 2 });
    let differs = false;
    for (const k of gU.keys()) {
      if (!gV.has(k)) {
        differs = true;
        break;
      }
    }
    if (!differs) {
      for (const k of gV.keys()) {
        if (!gU.has(k)) {
          differs = true;
          break;
        }
      }
    }
    expect(differs).toBe(true);
  });

  it.each([
    'flat_parapet',
    'custom_profile',
    'cone',
    'saltbox',
    'hip',
    'barrel',
    'mansard',
    'gambrel',
    'pavilion',
    'dutch_gable'
  ] as const)('style %s produces voxels on a square footprint', (style) => {
    const m = generateRoofVoxels(squareY0, [0, 1, 0], {
      style,
      height: 4,
      thickness: 2,
      shedEdgeIndex: 0,
      color: 0x888888,
      ...(style === 'custom_profile' ? { profileCurve: ROOF_PROFILE_CURVE_DEFAULT } : {})
    });
    expect(m.size).toBeGreaterThan(10);
  });
});
