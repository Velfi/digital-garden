import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { previewDrawScale, previewOrientation } from './previewScene';
import { FRAGMENT_MAX_RADIUS_MM, FRAGMENT_MIN_RADIUS_MM, FRAGMENT_GRADES } from './constants';
import { shapeFrom } from './facets';
import { makeFragments } from './fragments';
import { dentCoefficients, zeroShape } from './sphericalHarmonics';

describe('previewDrawScale', () => {
  it('draws the largest fragment at full size and the smallest smaller', () => {
    expect(previewDrawScale(FRAGMENT_MAX_RADIUS_MM)).toBeCloseTo(1, 9);

    const smallest = previewDrawScale(FRAGMENT_MIN_RADIUS_MM);
    expect(smallest).toBeLessThan(1);
    // Small enough to read as smaller, large enough to still read as a marimo.
    expect(smallest).toBeGreaterThan(0.5);
  });

  it('is monotonic, and clamps outside the fragment range', () => {
    let previous = 0;
    for (let mm = FRAGMENT_MIN_RADIUS_MM; mm <= FRAGMENT_MAX_RADIUS_MM; mm += 0.5) {
      const scale = previewDrawScale(mm);
      expect(scale).toBeGreaterThanOrEqual(previous);
      previous = scale;
    }
    expect(previewDrawScale(0)).toBe(previewDrawScale(FRAGMENT_MIN_RADIUS_MM));
    expect(previewDrawScale(1000)).toBe(previewDrawScale(FRAGMENT_MAX_RADIUS_MM));
  });
});

describe('previewOrientation', () => {
  /** Where the rotation puts a body-frame direction. */
  function place(shape: Parameters<typeof previewOrientation>[0], d: readonly number[]) {
    return new THREE.Vector3(d[0], d[1], d[2]).applyQuaternion(previewOrientation(shape));
  }

  it('turns the torn face toward the front and down', () => {
    const facet = { d: [0.6, 0.48, -0.64] as [number, number, number], depth: 0.09 };
    const placed = place(shapeFrom(zeroShape(), [facet]), facet.d);

    // Below the middle, so it reads as the side it was resting on, but tipped
    // toward the viewer rather than hidden underneath.
    expect(placed.y).toBeLessThan(0);
    expect(placed.z).toBeGreaterThan(0.5);
  });

  it('falls back to the biggest bulge when there is no face', () => {
    const dir = [0.577, 0.577, 0.577] as const;
    const placed = place(shapeFrom(dentCoefficients(dir[0], dir[1], dir[2], 0.16)), dir);
    expect(placed.y).toBeLessThan(0);
    expect(placed.z).toBeGreaterThan(0.5);
  });

  it('prefers the face over the bulge, for shapes that have both', () => {
    const bias = dentCoefficients(1, 0, 0, 0.16);
    const facet = { d: [0, 0, 1] as [number, number, number], depth: 0.09 };
    const placed = place(shapeFrom(bias, [facet]), facet.d);
    expect(placed.z).toBeGreaterThan(0.5);
  });

  it('is a rotation for every fragment the chooser can offer', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const fragment of makeFragments(seed)) {
        const quaternion = previewOrientation(shapeFrom(fragment.bias, fragment.facets));
        expect(quaternion.length()).toBeCloseTo(1, 9);
      }
    }
  });

  it('leaves a perfectly round shape alone rather than failing', () => {
    // Nothing to point at, so any rotation will do — but it has to be one.
    expect(previewOrientation(shapeFrom(zeroShape())).length()).toBeCloseTo(1, 9);
  });

  it('covers every grade the chooser draws', () => {
    // Guards the assumption above: at least one grade tears a face, and at
    // least one does not, so both branches are the live path for somebody.
    expect(FRAGMENT_GRADES.some((grade) => grade.tornFace > 0)).toBe(true);
    expect(FRAGMENT_GRADES.some((grade) => grade.tornFace === 0)).toBe(true);
  });
});
