import { describe, expect, it } from 'vitest';
import { STONE_MAX_IN_TANK, TANK_HALF_X, TANK_HALF_Z } from './constants';
import { mulberry32 } from './rng';
import { SH_BAND, peakDeviationRaw } from './sphericalHarmonics';
import {
  STONE_KINDS,
  findPlacement,
  footprint,
  makeStone,
  sheetSlotSeed,
  stoneCoefficients,
  stoneExtents,
  stoneHullPoints,
  stoneKindById,
  stoneOffers,
  stoneSurface,
  stoneSurfaceMix,
  type Occupant
} from './stones';

const point: [number, number, number] = [0, 0, 0];

describe('the catalogue', () => {
  it('has unique ids', () => {
    const ids = new Set(STONE_KINDS.map((kind) => kind.id));
    expect(ids.size).toBe(STONE_KINDS.length);
  });

  it('finds every kind by id, and nothing else', () => {
    for (const kind of STONE_KINDS) expect(stoneKindById(kind.id)).toBe(kind);
    expect(stoneKindById('marble')).toBeNull();
  });

  it('describes stones that are flatter than they are wide', () => {
    // Not a style preference: the resting pose, the placement footprint and the
    // collision ellipsoid all assume the short axis is the vertical one.
    for (const kind of STONE_KINDS) {
      expect(kind.maxFlatten).toBeLessThan(1);
      expect(kind.minFlatten).toBeGreaterThan(0);
      expect(kind.minFlatten).toBeLessThanOrEqual(kind.maxFlatten);
    }
  });
});

describe('stoneCoefficients', () => {
  it('hits the roughness it is asked for', () => {
    const rand = mulberry32(7);
    for (const target of [0.05, 0.12, 0.22]) {
      const coeffs = stoneCoefficients(rand, target);
      expect(peakDeviationRaw(coeffs)).toBeCloseTo(target, 4);
    }
  });

  it('spends nothing on the mean radius', () => {
    // An l=0 term is just a different way of saying "bigger", and the caption
    // on the sticker would then be wrong about the size.
    const coeffs = stoneCoefficients(mulberry32(3), 0.2);
    for (let k = 0; k < coeffs.length; k++) {
      if (SH_BAND[k] === 0) expect(coeffs[k]).toBe(0);
    }
  });
});

describe('makeStone', () => {
  it('is a pure function of the kind and the seed', () => {
    const kind = STONE_KINDS[0];
    expect(makeStone(kind, 12345)).toEqual(makeStone(kind, 12345));
    expect(makeStone(kind, 12345)).not.toEqual(makeStone(kind, 12346));
  });

  it('stays inside the kind it was drawn from', () => {
    for (const kind of STONE_KINDS) {
      for (let seed = 0; seed < 40; seed++) {
        const stone = makeStone(kind, seed * 7919);
        const radiusMm = stone.radiusM * 1000;
        expect(radiusMm).toBeGreaterThanOrEqual(kind.minRadiusMm - 1e-9);
        expect(radiusMm).toBeLessThanOrEqual(kind.maxRadiusMm + 1e-9);
        expect(stone.axes[1]).toBeGreaterThanOrEqual(kind.minFlatten - 1e-9);
        expect(stone.axes[1]).toBeLessThanOrEqual(kind.maxFlatten + 1e-9);
      }
    }
  });

  it('never turns a stone inside out', () => {
    // Every direction has to land outside the origin, or the surface has folded
    // through itself and the normals go with it.
    for (const kind of STONE_KINDS) {
      const stone = makeStone(kind, 99);
      for (let i = 0; i < 200; i++) {
        const z = (i / 200) * 2 - 1;
        const theta = i * 2.4;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        stoneSurface(stone, r * Math.cos(theta), r * Math.sin(theta), z, point);
        expect(Math.hypot(point[0], point[1], point[2])).toBeGreaterThan(0);
      }
    }
  });
});

describe('the surface mix', () => {
  it('stays in range everywhere', () => {
    for (const kind of STONE_KINDS) {
      const stone = makeStone(kind, 4242);
      for (let i = 0; i < 100; i++) {
        const z = (i / 100) * 2 - 1;
        const theta = i * 1.7;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const mix = stoneSurfaceMix(stone, kind, r * Math.cos(theta), r * Math.sin(theta), z);
        expect(mix.vein).toBeGreaterThanOrEqual(0);
        expect(mix.vein).toBeLessThanOrEqual(kind.banding + 1e-9);
        // Signed, and bounded by the kind's amount either way.
        expect(Math.abs(mix.grain)).toBeLessThanOrEqual(kind.grainAmount + 1e-9);
      }
    }
  });

  it('speckles both ways, so a pale rock stays pale', () => {
    // The bug this pins: an unsigned speckle drags the whole surface toward the
    // fleck colour, and granite came out brown instead of grey.
    const kind = stoneKindById('granite');
    if (!kind) throw new Error('no granite in the catalogue');
    const stone = makeStone(kind, 5);

    let sum = 0;
    let samples = 0;
    for (let i = 0; i < 400; i++) {
      const z = (i / 400) * 2 - 1;
      const theta = i * 2.39996;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      sum += stoneSurfaceMix(stone, kind, r * Math.cos(theta), r * Math.sin(theta), z).grain;
      samples++;
    }
    expect(Math.abs(sum / samples)).toBeLessThan(kind.grainAmount * 0.2);
  });
});

describe('what the box offers', () => {
  const flat = [0, 0, 0, 0];

  it('is the same four every visit', () => {
    expect(stoneOffers(1234, 'agate', 'medium', flat)).toEqual(
      stoneOffers(1234, 'agate', 'medium', flat)
    );
  });

  it('offers four different shapes of the one rock', () => {
    const offers = stoneOffers(99, 'flint', 'medium', flat);
    expect(offers.length).toBe(4);
    expect(offers.every((stone) => stone.kind === 'flint')).toBe(true);
    expect(new Set(offers.map((stone) => stone.seed)).size).toBe(4);
  });

  it('redraws only the slot that was peeled', () => {
    const before = stoneOffers(5, 'agate', 'medium', flat);
    const after = stoneOffers(5, 'agate', 'medium', [1, 0, 0, 0]);
    expect(after[0].seed).not.toBe(before[0].seed);
    // The other three are what you were still choosing between.
    expect(after.slice(1)).toEqual(before.slice(1));
  });

  it('redraws all four on a reroll', () => {
    const before = stoneOffers(5, 'agate', 'medium', flat);
    const after = stoneOffers(5, 'agate', 'medium', [1, 1, 1, 1]);
    for (let slot = 0; slot < 4; slot++) {
      expect(after[slot].seed).not.toBe(before[slot].seed);
    }
  });

  it('gives a different set for every rock and every size', () => {
    const seen = new Set<number>();
    for (const kind of STONE_KINDS) {
      for (const size of ['small', 'medium', 'large'] as const) {
        for (const stone of stoneOffers(7, kind.id, size, flat)) seen.add(stone.seed);
      }
    }
    expect(seen.size).toBe(STONE_KINDS.length * 3 * 4);
  });

  it('does not hand out the same stone under two slots', () => {
    // The failure this guards against is a lazily mixed seed, where slot n at
    // generation m collides with slot n+1 at m-1 and the box quietly repeats.
    const seen = new Set<number>();
    for (let slot = 0; slot < 8; slot++) {
      for (let generation = 0; generation < 40; generation++) {
        seen.add(sheetSlotSeed(31337, slot, generation));
      }
    }
    expect(seen.size).toBe(8 * 40);
  });
});

describe('the size choice', () => {
  it('scales the rock without changing which rock it is', () => {
    const kind = STONE_KINDS[0];
    const small = makeStone(kind, 42, 'small');
    const large = makeStone(kind, 42, 'large');

    expect(large.radiusM).toBeGreaterThan(small.radiusM * 2);
    // Same rock, same shape, same markings — only bigger.
    expect(large.coeffs).toEqual(small.coeffs);
    expect(large.axes).toEqual(small.axes);
    expect(large.faces).toEqual(small.faces);
  });

  it('keeps a large one of a small rock smaller than a large one of a big rock', () => {
    // The scales multiply the kind's own range rather than replacing it, so the
    // difference between the rocks survives the choice.
    const agate = makeStone(STONE_KINDS[0], 3, 'large');
    const granite = makeStone(stoneKindById('granite')!, 3, 'large');
    expect(agate.radiusM).toBeLessThan(granite.radiusM);
  });

  it('defaults to medium', () => {
    expect(makeStone(STONE_KINDS[0], 8).size).toBe('medium');
    expect(makeStone(STONE_KINDS[0], 8)).toEqual(makeStone(STONE_KINDS[0], 8, 'medium'));
  });
});

describe('findPlacement', () => {
  const extents = [0.008, 0.004, 0.006] as const;
  const rand = () => 0.5;

  it('keeps a stone inside the glass', () => {
    const spot = findPlacement(extents, [], rand, { x: 10, z: -10 });
    expect(Math.abs(spot.x)).toBeLessThanOrEqual(TANK_HALF_X - footprint(extents));
    expect(Math.abs(spot.z)).toBeLessThanOrEqual(TANK_HALF_Z - footprint(extents));
  });

  it('drops a stone exactly where it was aimed when the floor is clear', () => {
    const spot = findPlacement(extents, [], rand, { x: 0.01, z: -0.005 });
    expect(spot).toEqual({ x: 0.01, z: -0.005 });
  });

  it('moves off a stone that is already there', () => {
    const occupied: Occupant[] = [{ x: 0.01, z: -0.005, footprint: 0.012 }];
    const spot = findPlacement(extents, occupied, mulberry32(2), { x: 0.01, z: -0.005 });
    const gap = Math.hypot(spot.x - 0.01, spot.z + 0.005);
    expect(gap).toBeGreaterThan(0);
  });

  it('still answers when the floor is full', () => {
    // The jar's cap is low enough that this cannot really happen, but a search
    // that gave up would leave a click doing nothing for reasons nobody can see.
    const crowd: Occupant[] = Array.from({ length: STONE_MAX_IN_TANK }, (_, i) => ({
      x: (i % 4) * 0.02 - 0.03,
      z: Math.floor(i / 4) * 0.02 - 0.02,
      footprint: 0.02
    }));
    const spot = findPlacement(extents, crowd, mulberry32(9));
    expect(Number.isFinite(spot.x)).toBe(true);
    expect(Number.isFinite(spot.z)).toBe(true);
  });
});

describe('cleaved faces', () => {
  it('are only on the kinds that break', () => {
    for (const kind of STONE_KINDS) {
      const stone = makeStone(kind, 11);
      expect(stone.faces.length).toBe(kind.faces);
    }
  });

  it('actually flatten the surface', () => {
    // A face is not decoration: the radius along its normal has to come in by
    // the depth it claims, or the shape is still a smooth blob and the whole
    // point of borrowing `facets.ts` is lost.
    const kind = STONE_KINDS.find((entry) => entry.id === 'flint');
    if (!kind) throw new Error('no flint in the catalogue');
    const stone = makeStone(kind, 4);
    const face = stone.faces[0];

    stoneSurface(stone, face.d[0], face.d[1], face.d[2], point);
    // Undo the ellipsoid to get back to the radius the cut was applied to.
    const along = Math.hypot(
      point[0] / stone.axes[0],
      point[1] / stone.axes[1],
      point[2] / stone.axes[2]
    );
    expect(along).toBeLessThan(stone.radiusM * (1 - face.depth * 0.5));
  });

  it('leaves slate splitting along its bedding', () => {
    // The two faces of a split sheet are the top and the bottom, near enough
    // parallel. Any other rock fractures every which way.
    const kind = STONE_KINDS.find((entry) => entry.id === 'slate');
    if (!kind) throw new Error('no slate in the catalogue');
    for (let seed = 0; seed < 12; seed++) {
      const [first, second] = makeStone(kind, seed * 31).faces;
      const between =
        first.d[0] * second.d[0] + first.d[1] * second.d[1] + first.d[2] * second.d[2];
      expect(between).toBeLessThan(-0.9);
    }
  });
});

describe('the hull points', () => {
  it('lie on the surface the mesh is built from', () => {
    // The one property the physics stands on: the hull Jolt collides and the
    // stone the visitor sees are the same solid, to within the sampling.
    for (const kind of STONE_KINDS) {
      const stone = makeStone(kind, 8675309);
      const points = stoneHullPoints(stone);
      expect(points.length).toBeGreaterThan(300);

      const extents = stoneExtents(stone);
      for (let i = 0; i + 2 < points.length; i += 3) {
        expect(Math.abs(points[i])).toBeLessThanOrEqual(extents[0] + 1e-9);
        expect(Math.abs(points[i + 1])).toBeLessThanOrEqual(extents[1] + 1e-9);
        expect(Math.abs(points[i + 2])).toBeLessThanOrEqual(extents[2] + 1e-9);
      }
    }
  });

  it('are the same cloud every time they are asked for', () => {
    // A hull that varied between visits would have a stone settle differently
    // after a reload than it did before one.
    const stone = makeStone(STONE_KINDS[3], 99);
    expect(stoneHullPoints(stone)).toEqual(stoneHullPoints(stone));
  });
});
