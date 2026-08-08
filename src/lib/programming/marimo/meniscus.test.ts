import { describe, expect, it } from 'vitest';
import { GRAVITY, RHO_WATER, TANK_HALF_X, TANK_HALF_Z } from './constants';
import {
  CAPILLARY_LENGTH,
  CONTACT_ANGLE_DEG,
  SURFACE_TENSION,
  createSurfaceGeometry,
  meniscusAxis,
  meniscusPoint,
  meniscusRise,
  rimProfile,
  rimWidth
} from './meniscus';

/**
 * The profile is a closed-form solution to a differential equation, so it can be
 * checked against the equation rather than against a screenshot. That is what
 * most of this file does: reconstruct `z(d)` from the parametric samples, take
 * its curvature numerically, and confirm that surface tension really is holding
 * up the weight of water underneath it.
 *
 * The rest covers the mesh — that the vertices land where the profile says, that
 * the fillet gets its resolution where the curve is steep, and that the grid is
 * wound and sized the way the surface shader assumes.
 */

const SURFACE_STEP = 0.0017;

describe('the shape of the meniscus', () => {
  it('has a capillary length of about 2.7 mm', () => {
    expect(CAPILLARY_LENGTH).toBeCloseTo(Math.sqrt(SURFACE_TENSION / (RHO_WATER * GRAVITY)), 12);
    expect(CAPILLARY_LENGTH * 1000).toBeCloseTo(2.72, 2);
  });

  it('climbs the glass by lambda * sqrt(2 * (1 - sin theta))', () => {
    for (const theta of [0, 10, 20, 30, 45]) {
      const expected = CAPILLARY_LENGTH * Math.sqrt(2 * (1 - Math.sin((theta * Math.PI) / 180)));
      expect(meniscusRise(theta)).toBeCloseTo(expected, 10);
    }
    // Perfect wetting stands the surface vertical at the wall; the angle we
    // actually use keeps it steep but finite.
    expect(meniscusPoint(Math.PI / 2, 0).slope).toBeGreaterThan(1e15);
    expect(meniscusPoint(Math.PI / 2 - (20 * Math.PI) / 180, 20).slope).toBeCloseTo(
      Math.tan((70 * Math.PI) / 180),
      10
    );
  });

  it('solves the Young-Laplace equation it was derived from', () => {
    // rho g z = sigma * z'' / (1 + z'^2)^(3/2), everywhere along the curve.
    const wall = Math.PI / 2 - (CONTACT_ANGLE_DEG * Math.PI) / 180;

    for (let i = 1; i < 40; i++) {
      const psi = (wall * i) / 40;
      // The curve is parametric, so differentiate it that way: three closely
      // spaced samples in psi give the second derivative in d. The step is
      // relative because distance runs like -log(psi), so a fixed step in the
      // parameter is a wildly varying one in the thing being differentiated.
      const step = psi * 1e-4;
      const centre = meniscusPoint(psi);
      const lo = meniscusPoint(psi - step);
      const hi = meniscusPoint(psi + step);

      const dLo = lo.distance - centre.distance;
      const dHi = hi.distance - centre.distance;
      // Fit z = a + b*d + c*d^2 through the three points; z'' is 2c.
      const zLo = lo.height - centre.height;
      const zHi = hi.height - centre.height;
      const det = dLo * dHi * (dHi - dLo);
      const b = (zLo * dHi * dHi - zHi * dLo * dLo) / det;
      const c = (zHi * dLo - zLo * dHi) / det;

      const curvature = (2 * c) / Math.pow(1 + b * b, 1.5);
      const hydrostatic = (RHO_WATER * GRAVITY * centre.height) / SURFACE_TENSION;
      expect(curvature / hydrostatic).toBeCloseTo(1, 4);

      // And the reported slope is the slope of the reconstructed curve.
      expect(b).toBeCloseTo(-centre.slope, 5);
    }
  });

  it('decays exponentially with a scale of one capillary length', () => {
    // Far from the wall the equation linearises to z'' = z / lambda^2, so the
    // tail has to become a pure exponential with that exact rate.
    const far = [3, 4, 5, 6].map((n) => {
      const target = meniscusRise() * Math.exp(-n);
      const psi = 2 * Math.asin(target / (2 * CAPILLARY_LENGTH));
      return meniscusPoint(psi);
    });

    let previousError = Infinity;
    for (let i = 1; i < far.length; i++) {
      const ratio = far[i - 1].height / far[i].height;
      const gap = far[i].distance - far[i - 1].distance;
      const error = Math.abs(Math.log(ratio) - gap / CAPILLARY_LENGTH);
      expect(error).toBeLessThan(1e-3);
      // And it is still on its way there: each decade out is closer than the last.
      expect(error).toBeLessThan(previousError);
      previousError = error;
    }
  });

  it('is over well inside the jar', () => {
    // Two fillets have to leave a flat middle, or the surface is a capillary
    // bridge and none of this applies.
    expect(rimWidth()).toBeLessThan(Math.min(TANK_HALF_X, TANK_HALF_Z) / 2);
    expect(rimProfile().at(-1)!.height).toBeLessThan(1e-4);
    // And what is left where it is cut off tilts the surface by about a degree,
    // well under what the ripples are doing to the same water.
    expect(rimProfile().at(-1)!.slope).toBeLessThan(0.03);
  });
});

describe('where the fillet puts its vertices', () => {
  it('starts at the glass and moves outwards', () => {
    const profile = rimProfile();
    expect(profile[0].distance).toBe(0);
    expect(profile[0].height).toBeCloseTo(meniscusRise(), 12);

    for (let i = 1; i < profile.length; i++) {
      expect(profile[i].distance).toBeGreaterThan(profile[i - 1].distance);
      expect(profile[i].height).toBeLessThan(profile[i - 1].height);
      expect(profile[i].slope).toBeLessThan(profile[i - 1].slope);
    }
  });

  it('spends its samples where the curve is steep', () => {
    const profile = rimProfile();
    const first = profile[1].distance - profile[0].distance;
    const last = profile.at(-1)!.distance - profile.at(-2)!.distance;
    // Tight against the glass, relaxed out in the tail — but never so tight that
    // a step vanishes into float noise, nor so relaxed that the flat interior
    // grid is finer than the fillet it joins onto.
    expect(first).toBeLessThan(last * 0.75);
    expect(first).toBeGreaterThan(1e-5);
    expect(last).toBeLessThan(SURFACE_STEP);
  });
});

describe('the surface grid', () => {
  const axis = meniscusAxis(TANK_HALF_X, SURFACE_STEP);

  it('spans the jar exactly and rises only at the walls', () => {
    expect(axis.positions[0]).toBeCloseTo(-TANK_HALF_X, 12);
    expect(axis.positions.at(-1)!).toBeCloseTo(TANK_HALF_X, 12);
    expect(axis.heights[0]).toBeCloseTo(meniscusRise(), 12);
    expect(axis.heights.at(-1)!).toBeCloseTo(meniscusRise(), 12);

    for (let i = 1; i < axis.positions.length; i++) {
      expect(axis.positions[i]).toBeGreaterThan(axis.positions[i - 1]);
    }

    // The middle carries the fillet's exponential tail rather than a hard zero,
    // so that the mesh has no seam where the two meet. Sixteen e-folds out, that
    // is picometres.
    const middle = axis.heights[Math.floor(axis.heights.length / 2)];
    expect(middle).toBeGreaterThan(0);
    expect(middle).toBeLessThan(1e-9);
  });

  it('is symmetric, with the slope changing sign across the jar', () => {
    const n = axis.positions.length;
    for (let i = 0; i < n; i++) {
      expect(axis.positions[i]).toBeCloseTo(-axis.positions[n - 1 - i], 12);
      expect(axis.heights[i]).toBeCloseTo(axis.heights[n - 1 - i], 12);
      expect(axis.slopes[i]).toBeCloseTo(-axis.slopes[n - 1 - i], 12);
    }
    // Water climbs towards the glass, so the height falls going inwards from the
    // near wall and rises going outwards towards the far one.
    expect(axis.slopes[0]).toBeLessThan(0);
    expect(axis.slopes.at(-1)!).toBeGreaterThan(0);
  });

  it('carries a slope that is the derivative of the height it draws', () => {
    // The profile is convex, so a secant drawn across any three consecutive
    // vertices has to land between the tangents at its two ends. That is a real
    // constraint on a non-uniform grid — it fails immediately if the slopes are
    // mirrored onto the wrong wall or shifted by a vertex — and it is the
    // strongest statement available without assuming even spacing.
    for (let i = 1; i < axis.positions.length - 1; i++) {
      const gap = axis.positions[i + 1] - axis.positions[i - 1];
      const measured = (axis.heights[i + 1] - axis.heights[i - 1]) / gap;
      const lo = Math.min(axis.slopes[i - 1], axis.slopes[i + 1]);
      const hi = Math.max(axis.slopes[i - 1], axis.slopes[i + 1]);
      expect(measured).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(measured).toBeLessThanOrEqual(hi + 1e-9);
    }
  });

  it('builds a mesh whose corners climb twice as high as its walls', () => {
    const geometry = createSurfaceGeometry(TANK_HALF_X, TANK_HALF_Z, SURFACE_STEP);
    const position = geometry.getAttribute('position');
    const slope = geometry.getAttribute('aMeniscusSlope');
    const nx = meniscusAxis(TANK_HALF_X, SURFACE_STEP).positions.length;
    const nz = meniscusAxis(TANK_HALF_Z, SURFACE_STEP).positions.length;

    expect(position.count).toBe(nx * nz);
    expect(slope.count).toBe(nx * nz);
    expect(geometry.getIndex()!.count).toBe((nx - 1) * (nz - 1) * 6);

    // A corner gets both walls' climb; the middle of the jar gets neither.
    expect(position.getY(0)).toBeCloseTo(2 * meniscusRise(), 8);
    expect(position.getY(nx - 1)).toBeCloseTo(2 * meniscusRise(), 8);
    const centre = Math.floor(nz / 2) * nx + Math.floor(nx / 2);
    // Nanometres of climb and a ten-millionth of a degree of tilt: the tail, not
    // an exact zero, because the vertex nearest the middle is not exactly in it.
    expect(position.getY(centre)).toBeLessThan(1e-9);
    expect(Math.abs(slope.getX(centre))).toBeLessThan(1e-6);
    expect(Math.abs(slope.getY(centre))).toBeLessThan(1e-6);

    // Small enough to stay a sensible single draw. The plain plane it replaced
    // was 7168 triangles; buying the meniscus for under double that is the whole
    // reason the vertices are graded rather than uniform.
    expect(geometry.getIndex()!.count / 3).toBeLessThan(16000);
  });

  it('winds its triangles so the surface faces up', () => {
    const geometry = createSurfaceGeometry(TANK_HALF_X, TANK_HALF_Z, SURFACE_STEP);
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex()!;

    // Sample from the flat middle, where the triangle is horizontal and the sign
    // of the normal is unambiguous.
    const nx = meniscusAxis(TANK_HALF_X, SURFACE_STEP).positions.length;
    const quad = Math.floor(nz(geometry, nx) / 2) * (nx - 1) + Math.floor(nx / 2);
    const [a, b, c] = [0, 1, 2].map((k) => index.getX(quad * 6 + k));

    const ax = position.getX(a);
    const az = position.getZ(a);
    const u = [position.getX(b) - ax, 0, position.getZ(b) - az];
    const v = [position.getX(c) - ax, 0, position.getZ(c) - az];
    const normalY = v[0] * u[2] - v[2] * u[0];
    expect(normalY).toBeGreaterThan(0);
  });
});

function nz(geometry: ReturnType<typeof createSurfaceGeometry>, nx: number): number {
  return geometry.getAttribute('position').count / nx;
}
