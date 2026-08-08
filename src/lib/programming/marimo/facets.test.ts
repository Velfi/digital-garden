import { describe, expect, it } from 'vitest';
import {
  deepestFacet,
  facetGlsl,
  newShape,
  shapeFrom,
  smoothMin,
  surfaceScale,
  writeFacet
} from './facets';
import { FACET_RIM, MAX_FACETS } from './constants';
import { mulberry32 } from './rng';
import { SH_COUNT, dentCoefficients, radiusScaleAt, zeroShape } from './sphericalHarmonics';

function uniformDirection(rand: () => number): [number, number, number] {
  const z = 2 * rand() - 1;
  const t = 2 * Math.PI * rand();
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(t), r * Math.sin(t), z];
}

/** Any unit vector perpendicular to `d`. */
function perpendicular(d: readonly number[]): [number, number, number] {
  const seed: [number, number, number] = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const px = seed[1] * d[2] - seed[2] * d[1];
  const py = seed[2] * d[0] - seed[0] * d[2];
  const pz = seed[0] * d[1] - seed[1] * d[0];
  const len = Math.hypot(px, py, pz);
  return [px / len, py / len, pz / len];
}

describe('smoothMin', () => {
  it('is exact wherever the two are further apart than the blend', () => {
    // The property the whole scheme rests on. A smooth minimum that shaved a
    // little off everywhere would shrink the ball once per facet, and put the
    // render out of step with the physics that shares this function.
    expect(smoothMin(1, 1 - 0.2, 0.05)).toBe(0.8);
    expect(smoothMin(1, 4, 0.05)).toBe(1);
  });

  it('never returns more than the plain minimum, or much less', () => {
    const rand = mulberry32(4);
    for (let i = 0; i < 500; i++) {
      const a = rand() * 2;
      const b = rand() * 2;
      const k = 0.01 + rand() * 0.2;
      const blended = smoothMin(a, b, k);
      expect(blended).toBeLessThanOrEqual(Math.min(a, b) + 1e-12);
      // The dip is bounded by k/4, at a == b.
      expect(blended).toBeGreaterThanOrEqual(Math.min(a, b) - k / 4 - 1e-12);
    }
  });

  it('degrades to a hard minimum when there is no blend to spend', () => {
    expect(smoothMin(0.3, 0.7, 0)).toBe(0.3);
    expect(smoothMin(0.3, 0.7, -1)).toBe(0.3);
  });
});

describe('surfaceScale', () => {
  it('is the sphere when there are no faces', () => {
    const rand = mulberry32(11);
    const coeffs = dentCoefficients(0, -1, 0, 0.1);
    for (let i = 0; i < 50; i++) {
      const [x, y, z] = uniformDirection(rand);
      expect(surfaceScale(shapeFrom(coeffs), x, y, z)).toBe(radiusScaleAt(coeffs, x, y, z));
    }
  });

  it('cuts exactly `depth` at the centre of a face', () => {
    const rand = mulberry32(12);
    for (let i = 0; i < 30; i++) {
      const d = uniformDirection(rand);
      const depth = 0.02 + rand() * 0.12;
      const shape = shapeFrom(zeroShape(), [{ d, depth }]);
      expect(surfaceScale(shape, d[0], d[1], d[2])).toBeCloseTo(1 - depth, 12);
    }
  });

  it('is actually flat across the face, not merely low', () => {
    // The entire reason facets exist. A spherical-harmonic dent produces a bowl:
    // its deepest point is a point. A face is planar, so every sample across it
    // sits on one plane — which is what the eye reads as "it has been resting".
    const d: [number, number, number] = [0, -1, 0];
    const depth = 0.1;
    const shape = shapeFrom(zeroShape(), [{ d, depth }]);
    const side = perpendicular(d);

    for (const angle of [0.05, 0.12, 0.2]) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const n: [number, number, number] = [
        d[0] * cos + side[0] * sin,
        d[1] * cos + side[1] * sin,
        d[2] * cos + side[2] * sin
      ];
      const scale = surfaceScale(shape, n[0], n[1], n[2]);
      // Distance from the centre along the face normal: constant on a plane.
      const alongNormal = scale * (n[0] * d[0] + n[1] * d[1] + n[2] * d[2]);
      expect(alongNormal).toBeCloseTo(1 - depth, 6);
    }
  });

  it('leaves the far side of the ball completely alone', () => {
    const shape = shapeFrom(zeroShape(), [{ d: [0, -1, 0], depth: 0.14 }]);
    expect(surfaceScale(shape, 0, 1, 0)).toBe(1);
    expect(surfaceScale(shape, 1, 0, 0)).toBe(1);
  });

  it('rounds the rim rather than creasing it', () => {
    // Sampled either side of where the plane meets the sphere: no step, and no
    // corner sharp enough to alias at the mesh density the body is drawn at.
    const shape = shapeFrom(zeroShape(), [{ d: [0, -1, 0], depth: 0.1 }]);
    const side = perpendicular([0, -1, 0]);
    let previous = surfaceScale(shape, 0, -1, 0);
    let previousStep = 0;
    for (let i = 1; i <= 60; i++) {
      const angle = (i / 60) * (Math.PI / 2);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const scale = surfaceScale(shape, side[0] * sin, -cos, side[2] * sin);
      const step = scale - previous;
      expect(step).toBeGreaterThanOrEqual(-1e-12);
      // No sudden change in slope either — that is what a crease would be.
      expect(Math.abs(step - previousStep)).toBeLessThan(0.02);
      previous = scale;
      previousStep = step;
    }
  });

  it('takes the deeper of two faces pointing the same way', () => {
    // How the live contact and the grown-in flat coexist: they are the same
    // face at different depths, and a plane cut simply takes the lower.
    const shape = shapeFrom(zeroShape(), [
      { d: [0, -1, 0], depth: 0.04 },
      { d: [0, -1, 0], depth: 0.11 }
    ]);
    expect(surfaceScale(shape, 0, -1, 0)).toBeCloseTo(0.89, 12);
  });

  it('never turns the ball inside out, whatever it is given', () => {
    const rand = mulberry32(99);
    for (let trial = 0; trial < 200; trial++) {
      const coeffs = dentCoefficients(...uniformDirection(rand), 0.18);
      const facets = Array.from({ length: 1 + Math.floor(rand() * MAX_FACETS) }, () => ({
        d: uniformDirection(rand),
        depth: rand() * 0.15
      }));
      const shape = shapeFrom(coeffs, facets);
      for (let i = 0; i < 40; i++) {
        const [x, y, z] = uniformDirection(rand);
        const scale = surfaceScale(shape, x, y, z);
        expect(scale).toBeGreaterThan(0.5);
        expect(scale).toBeLessThan(1.5);
      }
    }
  });

  it('ignores pool entries past the live count', () => {
    // The scratch shape is reused every frame; a stale slot must not draw.
    const shape = newShape(zeroShape(), MAX_FACETS + 1);
    writeFacet(shape, 0, [0, -1, 0], 0.1);
    expect(surfaceScale(shape, 0, -1, 0)).toBeCloseTo(0.9, 12);
    shape.facetCount = 0;
    expect(surfaceScale(shape, 0, -1, 0)).toBe(1);
  });
});

describe('deepestFacet', () => {
  it('finds the face the ball will lie on', () => {
    const shape = shapeFrom(zeroShape(), [
      { d: [1, 0, 0], depth: 0.03 },
      { d: [0, -1, 0], depth: 0.12 },
      { d: [0, 0, 1], depth: 0.07 }
    ]);
    expect(deepestFacet(shape)!.d).toEqual([0, -1, 0]);
  });

  it('is null when there is nothing to lie on', () => {
    expect(deepestFacet(shapeFrom(zeroShape()))).toBeNull();
    expect(deepestFacet(shapeFrom(zeroShape(), [{ d: [0, -1, 0], depth: 0 }]))).toBeNull();
  });
});

describe('the GLSL twin', () => {
  it('declares the array the uniforms are written into', () => {
    const glsl = facetGlsl(MAX_FACETS + 1);
    expect(glsl).toContain(`const int MARIMO_MAX_FACETS = ${MAX_FACETS + 1};`);
    expect(glsl).toContain('uniform vec4 uFacets[MARIMO_MAX_FACETS];');
    expect(glsl).toContain('uniform int uFacetCount;');
  });

  it('carries the same blend width the TypeScript uses', () => {
    // The two implementations are separate code; this is the one number that
    // would silently put them out of step, so it is generated, not typed twice.
    expect(facetGlsl(4)).toContain(FACET_RIM.toFixed(6));
  });

  it('keeps its loop bound a compile-time constant', () => {
    // GLSL ES 1.00 requires it. A loop over `uFacetCount` compiles on desktop
    // and fails on exactly the mobile drivers nobody tests on.
    expect(facetGlsl(4)).toContain('for (int i = 0; i < MARIMO_MAX_FACETS; i++)');
  });
});

describe('shapeFrom', () => {
  it('copies the faces rather than sharing them', () => {
    const facets = [{ d: [0, -1, 0] as [number, number, number], depth: 0.1 }];
    const shape = shapeFrom(zeroShape(), facets);
    shape.facets[0].depth = 0.9;
    shape.facets[0].d[1] = 1;
    expect(facets[0].depth).toBe(0.1);
    expect(facets[0].d[1]).toBe(-1);
  });

  it('sizes the pool to what it was given', () => {
    expect(shapeFrom(zeroShape()).facetCount).toBe(0);
    expect(newShape(new Array<number>(SH_COUNT).fill(0), 4).facets).toHaveLength(4);
  });
});
