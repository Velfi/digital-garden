import { describe, expect, it } from 'vitest';
import {
  DENT_KERNEL,
  SH_BAND,
  SH_COUNT,
  addShapes,
  dentCoefficients,
  peakDeviationRaw,
  radiusScaleAt,
  shBasis,
  shapeRoughness,
  tiltedDentCoefficients,
  zeroShape
} from './sphericalHarmonics';
import { mulberry32 } from './rng';

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

describe('shBasis', () => {
  it('pins the canonical coefficient ordering at the axis directions', () => {
    // These hand-computed values are the contract between the TypeScript basis
    // and the GLSL twin in SH_GLSL. If a reordering happens, this fails first.
    const plusX = shBasis(1, 0, 0, new Array(SH_COUNT)) as number[];
    expect(plusX[0]).toBeCloseTo(0.2820948, 6);
    expect(plusX[3]).toBeCloseTo(0.4886025, 6); // Y(1,1) ~ x
    expect(plusX[6]).toBeCloseTo(-0.3153916, 6); // Y(2,0) ~ 3z^2-1
    expect(plusX[8]).toBeCloseTo(0.5462742, 6); // Y(2,2) ~ x^2-y^2
    expect(plusX[13]).toBeCloseTo(-0.4570458, 6); // Y(3,1) ~ x(5z^2-1)
    expect(plusX[15]).toBeCloseTo(0.5900436, 6); // Y(3,3) ~ x(x^2-3y^2)
    for (const k of [1, 2, 4, 5, 7, 9, 10, 11, 12, 14]) {
      expect(plusX[k]).toBeCloseTo(0, 12);
    }

    const plusZ = shBasis(0, 0, 1, new Array(SH_COUNT)) as number[];
    expect(plusZ[2]).toBeCloseTo(0.4886025, 6); // Y(1,0) ~ z
    expect(plusZ[6]).toBeCloseTo(0.6307831, 6);
    expect(plusZ[12]).toBeCloseTo(0.7463527, 6); // Y(3,0) ~ z(5z^2-3)
    for (const k of [1, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15]) {
      expect(plusZ[k]).toBeCloseTo(0, 12);
    }
  });

  it('is orthonormal over the sphere', () => {
    const rand = mulberry32(0xc0ffee);
    const samples = 200_000;
    const acc = new Float64Array(SH_COUNT * SH_COUNT);
    const scratch = new Array<number>(SH_COUNT);

    for (let s = 0; s < samples; s++) {
      const [x, y, z] = uniformDirection(rand);
      const b = shBasis(x, y, z, scratch) as number[];
      for (let i = 0; i < SH_COUNT; i++) {
        for (let j = i; j < SH_COUNT; j++) {
          acc[i * SH_COUNT + j] += b[i] * b[j];
        }
      }
    }

    for (let i = 0; i < SH_COUNT; i++) {
      for (let j = i; j < SH_COUNT; j++) {
        const integral = (acc[i * SH_COUNT + j] / samples) * 4 * Math.PI;
        expect(integral).toBeCloseTo(i === j ? 1 : 0, 1);
      }
    }
  });
});

describe('dentCoefficients', () => {
  it('flattens by exactly the requested amount at the dent centre', () => {
    const rand = mulberry32(7);
    for (let trial = 0; trial < 20; trial++) {
      const d = uniformDirection(rand);
      const amount = 0.02 + rand() * 0.12;
      const coeffs = dentCoefficients(d[0], d[1], d[2], amount);
      expect(radiusScaleAt(coeffs, d[0], d[1], d[2])).toBeCloseTo(1 - amount, 9);
    }
  });

  it('is exactly rotationally symmetric about the dent direction', () => {
    // This is the spherical-harmonic addition theorem, and the whole
    // resting-flat-spot model depends on it holding to machine precision.
    const rand = mulberry32(99);
    const d = uniformDirection(rand);
    const coeffs = dentCoefficients(d[0], d[1], d[2], 0.14);

    const p = perpendicular(d);
    const q: [number, number, number] = [
      d[1] * p[2] - d[2] * p[1],
      d[2] * p[0] - d[0] * p[2],
      d[0] * p[1] - d[1] * p[0]
    ];

    for (const polar of [0.4, 1.0, 1.9, 2.7]) {
      const cos = Math.cos(polar);
      const sin = Math.sin(polar);
      let reference = Number.NaN;
      for (let i = 0; i < 24; i++) {
        const phi = (i / 24) * 2 * Math.PI;
        const x = cos * d[0] + sin * (Math.cos(phi) * p[0] + Math.sin(phi) * q[0]);
        const y = cos * d[1] + sin * (Math.cos(phi) * p[1] + Math.sin(phi) * q[1]);
        const z = cos * d[2] + sin * (Math.cos(phi) * p[2] + Math.sin(phi) * q[2]);
        const value = radiusScaleAt(coeffs, x, y, z);
        if (i === 0) reference = value;
        else expect(value).toBeCloseTo(reference, 9);
      }
    }
  });

  it('redistributes rather than shrinking - the far side bulges', () => {
    const coeffs = dentCoefficients(0, -1, 0, 0.16);
    expect(radiusScaleAt(coeffs, 0, -1, 0)).toBeCloseTo(0.84, 9);
    // Band 0 is excluded from the kernel, so volume moves elsewhere.
    expect(radiusScaleAt(coeffs, 0, 1, 0)).toBeGreaterThan(1);
    expect(DENT_KERNEL[0]).toBe(0);
  });

  it('leaves a zero shape perfectly round in every direction', () => {
    const rand = mulberry32(3);
    const shape = zeroShape();
    for (let i = 0; i < 50; i++) {
      const [x, y, z] = uniformDirection(rand);
      expect(radiusScaleAt(shape, x, y, z)).toBe(1);
    }
  });

  it('is unchanged by a flat tilt, and re-weighted by anything else', () => {
    const plain = dentCoefficients(0.3, -0.6, 0.74, 0.1);
    expect(tiltedDentCoefficients(0.3, -0.6, 0.74, 0.1, [1, 1, 1, 1])).toEqual(plain);

    const tilted = tiltedDentCoefficients(0.3, -0.6, 0.74, 0.1, [1, 0, 1, 3]);
    for (let k = 0; k < SH_COUNT; k++) {
      const factor = [1, 0, 1, 3][SH_BAND[k]];
      expect(tilted[k]).toBeCloseTo(plain[k] * factor, 12);
    }
  });

  it('keeps a tilted dent rotationally symmetric', () => {
    // The whole point of tilting per band rather than per coefficient: the
    // addition theorem still applies, so the lobe is still a lobe.
    const rand = mulberry32(21);
    const d = uniformDirection(rand);
    const coeffs = tiltedDentCoefficients(d[0], d[1], d[2], 0.12, [0, 0.2, 1, 2.4]);

    const p = perpendicular(d);
    const q: [number, number, number] = [
      d[1] * p[2] - d[2] * p[1],
      d[2] * p[0] - d[0] * p[2],
      d[0] * p[1] - d[1] * p[0]
    ];

    for (const polar of [0.5, 1.3, 2.4]) {
      const cos = Math.cos(polar);
      const sin = Math.sin(polar);
      let reference = Number.NaN;
      for (let i = 0; i < 16; i++) {
        const phi = (i / 16) * 2 * Math.PI;
        const x = cos * d[0] + sin * (Math.cos(phi) * p[0] + Math.sin(phi) * q[0]);
        const y = cos * d[1] + sin * (Math.cos(phi) * p[1] + Math.sin(phi) * q[1]);
        const z = cos * d[2] + sin * (Math.cos(phi) * p[2] + Math.sin(phi) * q[2]);
        const value = radiusScaleAt(coeffs, x, y, z);
        if (i === 0) reference = value;
        else expect(value).toBeCloseTo(reference, 9);
      }
    }
  });

  it('assigns every coefficient a band', () => {
    expect(SH_BAND).toHaveLength(SH_COUNT);
    expect(SH_BAND.filter((l) => l === 0)).toHaveLength(1);
    expect(SH_BAND.filter((l) => l === 1)).toHaveLength(3);
    expect(SH_BAND.filter((l) => l === 2)).toHaveLength(5);
    expect(SH_BAND.filter((l) => l === 3)).toHaveLength(7);
  });
});

describe('shapeRoughness', () => {
  it('calls a pure l=1 shape perfectly smooth', () => {
    // An l=1 term slides the ball rather than deforming it, so however large it
    // is there is nothing to see. This is the reason the metric exists.
    const shifted = zeroShape();
    shifted[1] = 0.2;
    shifted[3] = -0.15;
    expect(shapeRoughness(shifted)).toBeCloseTo(0, 12);
    expect(peakDeviationRaw(shifted)).toBeGreaterThan(0.1);
  });

  it('ignores l=1 content laid over a real lump', () => {
    const rand = mulberry32(404);
    const d = uniformDirection(rand);
    const lump = tiltedDentCoefficients(d[0], d[1], d[2], 0.1, [0, 0, 1, 2]);
    const alone = shapeRoughness(lump);

    const shifted = zeroShape();
    shifted[2] = 0.12;
    expect(shapeRoughness(addShapes(lump, shifted))).toBeCloseTo(alone, 12);
    expect(alone).toBeGreaterThan(0.02);
  });

  it('scales with the shape', () => {
    const rand = mulberry32(11);
    const d = uniformDirection(rand);
    const lump = dentCoefficients(d[0], d[1], d[2], 0.1);
    const doubled = lump.map((c) => c * 2);
    expect(shapeRoughness(doubled)).toBeCloseTo(shapeRoughness(lump) * 2, 12);
  });
});
