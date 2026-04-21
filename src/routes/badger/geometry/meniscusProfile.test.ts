import { describe, it, expect } from 'vitest';
import {
  ENAMEL_CAPILLARY_LENGTH_MM,
  cellMeniscusContext,
  distanceToBoundary,
  meniscusDip1D,
  meniscusDipAt,
  meniscusDipAtWall
} from './meniscusProfile';

const KAPPA = ENAMEL_CAPILLARY_LENGTH_MM;

function square(size: number) {
  const h = size / 2;
  return [
    { x: -h, y: -h },
    { x: h, y: -h },
    { x: h, y: h },
    { x: -h, y: h }
  ];
}

describe('meniscusDipAtWall', () => {
  it('matches analytic form κ·sqrt(2(1−sinθ)) at several angles', () => {
    for (const deg of [0, 15, 30, 60, 89]) {
      const theta = (deg * Math.PI) / 180;
      const expected = KAPPA * Math.sqrt(2 * (1 - Math.sin(theta)));
      const got = meniscusDipAtWall({ contactAngle: theta });
      expect(got).toBeCloseTo(expected, 9);
    }
  });

  it('is zero at θ=90° (flat, no meniscus)', () => {
    expect(meniscusDipAtWall({ contactAngle: Math.PI / 2 })).toBeCloseTo(0, 9);
  });
});

describe('meniscusDip1D', () => {
  it('is 0 at the wall (d=0, contact line coincides with rim)', () => {
    expect(meniscusDip1D(0)).toBe(0);
  });

  it('is monotonically increasing from wall to bath', () => {
    let prev = 0;
    for (let d = 0.01; d <= 5 * KAPPA; d += 0.1) {
      const z = meniscusDip1D(d);
      expect(z).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = z;
    }
  });

  it('approaches dip₀ as d → ∞', () => {
    const dip0 = meniscusDipAtWall();
    expect(meniscusDip1D(5 * KAPPA)).toBeGreaterThan(0.99 * dip0);
    expect(meniscusDip1D(10 * KAPPA)).toBeCloseTo(dip0, 6);
  });

  it('stays strictly below dip₀ for finite d', () => {
    const dip0 = meniscusDipAtWall();
    expect(meniscusDip1D(0.5)).toBeLessThan(dip0);
    expect(meniscusDip1D(2)).toBeLessThan(dip0);
  });
});

describe('distanceToBoundary', () => {
  it('returns 0 at the boundary of a unit square', () => {
    const sq = square(2);
    expect(distanceToBoundary(-1, 0, sq)).toBe(0);
    expect(distanceToBoundary(1, 0, sq)).toBe(0);
  });

  it('returns the inradius at the centre of a unit square', () => {
    const sq = square(2);
    expect(distanceToBoundary(0, 0, sq)).toBeCloseTo(1, 9);
  });

  it('returns 0 for points outside the polygon', () => {
    const sq = square(2);
    expect(distanceToBoundary(5, 0, sq)).toBe(0);
    expect(distanceToBoundary(0, -5, sq)).toBe(0);
  });

  it('respects holes — point inside the hole reads 0', () => {
    const outer = square(4); // side 4, centered at origin
    const hole = [
      { x: -0.5, y: -0.5 },
      { x: 0.5, y: -0.5 },
      { x: 0.5, y: 0.5 },
      { x: -0.5, y: 0.5 }
    ];
    expect(distanceToBoundary(0, 0, outer, [hole])).toBe(0);
  });

  it('distance to hole edge is closer than outer edge for points near the hole', () => {
    const outer = square(10);
    const hole = [
      { x: -0.5, y: -0.5 },
      { x: 0.5, y: -0.5 },
      { x: 0.5, y: 0.5 },
      { x: -0.5, y: 0.5 }
    ];
    // Point at (1, 0): 0.5 from hole right edge, 4 from outer right edge
    expect(distanceToBoundary(1, 0, outer, [hole])).toBeCloseTo(0.5, 9);
  });
});

describe('meniscusDipAt — cell-size dependence', () => {
  it('large cell (≫ 2κ): centre dip approaches dip₀', () => {
    // 20 mm square, centre is 10 mm ≈ 6κ from each wall. Linearised closed
    // form gives dip = dip₀·(1 − sech(inradius/κ)); sech(6) ≈ 0.005, so
    // centre dip is ≥ 0.99·dip₀.
    const sq = square(20);
    const ctx = cellMeniscusContext(sq);
    const centreDip = meniscusDipAt(0, 0, ctx);
    expect(centreDip).toBeGreaterThan(0.95 * meniscusDipAtWall());
  });

  it('small cell (≪ 2κ): centre dip is small — walls hold surface up', () => {
    // 1 mm square, inradius ≈ 0.5 mm ≈ 0.3κ. sech(0.3) ≈ 0.956, so centre
    // dip ≈ 0.04·dip₀. Physically: the cell is narrower than a capillary
    // length so the walls prevent the surface from dropping much.
    const sq = square(1);
    const ctx = cellMeniscusContext(sq);
    const centreDip = meniscusDipAt(0, 0, ctx);
    expect(centreDip).toBeLessThan(0.2 * meniscusDipAtWall());
  });

  it('larger cells dip more than smaller cells at their centres', () => {
    // Primary physical behaviour we care about: bigger enamel field =
    // visibly deeper bowl.
    const smallCtx = cellMeniscusContext(square(1));
    const mediumCtx = cellMeniscusContext(square(3));
    const largeCtx = cellMeniscusContext(square(10));
    const small = meniscusDipAt(0, 0, smallCtx);
    const medium = meniscusDipAt(0, 0, mediumCtx);
    const large = meniscusDipAt(0, 0, largeCtx);
    expect(medium).toBeGreaterThan(small);
    expect(large).toBeGreaterThan(medium);
  });

  it('returns 0 at cell walls (contact line at rim)', () => {
    // Slightly inside the wall; exact-boundary points are ambiguous under
    // ray-casting, but any interior point within sub-μm of the wall must
    // read a dip of 0 up to float precision.
    const sq = square(4);
    const ctx = cellMeniscusContext(sq);
    expect(meniscusDipAt(-1.9999, 0, ctx)).toBeLessThan(1e-4);
    expect(meniscusDipAt(1.9999, 0, ctx)).toBeLessThan(1e-4);
  });

  it('dip increases monotonically from wall toward centre', () => {
    // 4 mm square: sample along the +x axis from wall to centre.
    const sq = square(4);
    const ctx = cellMeniscusContext(sq);
    let prev = meniscusDipAt(1.999, 0, ctx);
    for (let x = 1.9; x >= 0; x -= 0.1) {
      const dip = meniscusDipAt(x, 0, ctx);
      expect(dip).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = dip;
    }
  });
});

describe('cellMeniscusContext', () => {
  it('computes correct bbox and non-zero inradius for a square', () => {
    const sq = square(4);
    const ctx = cellMeniscusContext(sq);
    expect(ctx.bbox).toEqual({ minX: -2, minY: -2, maxX: 2, maxY: 2 });
    // Inradius of a 4mm square is 2mm; coarse 12×12 sampling recovers a
    // value within one grid step (≈ 0.33 mm).
    expect(ctx.inradius).toBeGreaterThan(1.5);
    expect(ctx.inradius).toBeLessThanOrEqual(2.0);
  });
});
