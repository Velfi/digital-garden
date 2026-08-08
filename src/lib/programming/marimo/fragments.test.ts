import { describe, expect, it } from 'vitest';
import {
  describeRoughness,
  fragmentBias,
  makeFragment,
  makeFragments,
  marimoFromFragment,
  randomFragment
} from './fragments';
import {
  BIAS_MAX,
  FRAGMENT_GRADES,
  FRAGMENT_MAX_RADIUS_MM,
  FRAGMENT_MIN_RADIUS_MM,
  SHAPE_DEVIATION_CLAMP
} from './constants';
import { validateMarimoState } from './persist';
import { mulberry32 } from './rng';
import {
  DENT_UNIT_NORM,
  SH_COUNT,
  radiusScaleAt,
  shapeMagnitude,
  shapeRoughness
} from './sphericalHarmonics';

const T0 = 1_700_000_000_000;

describe('fragmentBias', () => {
  it('lands inside its grade band, for every grade', () => {
    const rand = mulberry32(1);
    for (const grade of FRAGMENT_GRADES) {
      for (let i = 0; i < 200; i++) {
        const rough = shapeRoughness(fragmentBias(rand, grade));
        expect(rough).toBeGreaterThanOrEqual(grade.minPeak - 1e-9);
        expect(rough).toBeLessThanOrEqual(grade.maxPeak + 1e-9);
      }
    }
  });

  it('never asks for a shape the renderer would have to clamp away', () => {
    // The shader clamps total deviation; a fragment that needed clamping would
    // look different in the tank from how it looked in the chooser.
    const rand = mulberry32(99);
    const roughest = FRAGMENT_GRADES[FRAGMENT_GRADES.length - 1];
    for (let i = 0; i < 200; i++) {
      const bias = fragmentBias(rand, roughest);
      for (let s = 0; s < 64; s++) {
        const z = 1 - (2 * s + 1) / 64;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const theta = 2.399963 * s;
        const deviation = radiusScaleAt(bias, r * Math.cos(theta), r * Math.sin(theta), z) - 1;
        expect(Math.abs(deviation)).toBeLessThan(SHAPE_DEVIATION_CLAMP);
      }
    }
  });

  it('stays inside the cap a grown marimo obeys', () => {
    // Otherwise the first growth step would shrink the shape you were shown.
    const rand = mulberry32(7);
    for (const grade of FRAGMENT_GRADES) {
      for (let i = 0; i < 200; i++) {
        expect(shapeMagnitude(fragmentBias(rand, grade))).toBeLessThanOrEqual(
          BIAS_MAX * DENT_UNIT_NORM + 1e-12
        );
      }
    }
  });
});

describe('grades', () => {
  it('keeps the bands apart and in order', () => {
    // The whole point of the chooser is three obviously different shapes; bands
    // that touched would let two of them come out the same.
    for (let i = 0; i < FRAGMENT_GRADES.length - 1; i++) {
      expect(FRAGMENT_GRADES[i].minPeak).toBeLessThan(FRAGMENT_GRADES[i].maxPeak);
      expect(FRAGMENT_GRADES[i].maxPeak).toBeLessThan(FRAGMENT_GRADES[i + 1].minPeak);
    }
  });

  it('describes each band as the grade it belongs to', () => {
    for (const grade of FRAGMENT_GRADES) {
      expect(describeRoughness(grade.minPeak)).toBe(grade.word);
      expect(describeRoughness(grade.maxPeak)).toBe(grade.word);
    }
  });
});

describe('labels', () => {
  it('describes the roughness the fragment actually has', () => {
    // The label is measured off the finished shape rather than taken from the
    // grade, so a piece that had to be capped is not oversold.
    for (let seed = 0; seed < 120; seed++) {
      for (const fragment of makeFragments(seed)) {
        const word = fragment.label.split(', ')[1];
        expect(word).toBe(describeRoughness(shapeRoughness(fragment.bias)));
      }
    }
  });

  it('gives each option the word its grade promises', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const fragment of makeFragments(seed)) {
        expect(fragment.label).toContain(FRAGMENT_GRADES[fragment.grade].word);
      }
    }
  });
});

describe('makeFragments', () => {
  it('is reproducible from its master seed', () => {
    expect(makeFragments(4242)).toEqual(makeFragments(4242));
  });

  it('offers one of each grade, roundest first', () => {
    const fragments = makeFragments(987);
    expect(fragments).toHaveLength(FRAGMENT_GRADES.length);
    expect(fragments.map((f) => f.grade)).toEqual(FRAGMENT_GRADES.map((_, i) => i));
    // Same seed for every fragment would mean the same strand layout on all
    // three, which is the sort of thing that looks fine until you pick one.
    expect(new Set(fragments.map((f) => f.seed)).size).toBe(FRAGMENT_GRADES.length);
    expect(new Set(fragments.map((f) => f.radiusMm)).size).toBe(FRAGMENT_GRADES.length);
  });

  it('always offers three visibly different shapes', () => {
    // The gap, not just the order: two options a couple of percent apart would
    // be a choice between things nobody can tell apart.
    for (let seed = 0; seed < 300; seed++) {
      const rough = makeFragments(seed).map((f) => shapeRoughness(f.bias));
      for (let i = 0; i < rough.length - 1; i++) {
        expect(rough[i + 1] - rough[i]).toBeGreaterThan(0.02);
      }
    }
  });

  it('keeps every fragment in range, across many draws', () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const fragment of makeFragments(seed)) {
        expect(fragment.radiusMm).toBeGreaterThanOrEqual(FRAGMENT_MIN_RADIUS_MM);
        expect(fragment.radiusMm).toBeLessThanOrEqual(FRAGMENT_MAX_RADIUS_MM);
        expect(fragment.bias).toHaveLength(SH_COUNT);
        expect(fragment.bias.every(Number.isFinite)).toBe(true);
        expect(fragment.label).toMatch(/^\d+ mm across, /);
      }
    }
  });
});

describe('randomFragment', () => {
  it('reaches every grade, and stays valid', () => {
    const grades = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      const fragment = randomFragment(seed);
      grades.add(fragment.grade);
      expect(validateMarimoState(marimoFromFragment(fragment, T0))).not.toBeNull();
    }
    expect(grades.size).toBe(FRAGMENT_GRADES.length);
  });
});

describe('marimoFromFragment', () => {
  it('produces a marimo that validates and persists', () => {
    for (const fragment of makeFragments(31337)) {
      const state = marimoFromFragment(fragment, T0);
      expect(validateMarimoState(state)).not.toBeNull();
      expect(state.radiusMm).toBe(fragment.radiusMm);
      expect(state.seed).toBe(fragment.seed);
      expect(state.bornAt).toBe(T0);
    }
  });

  it('copies the bias rather than sharing it', () => {
    // The chooser keeps its fragments around to re-render; a shared array would
    // let the tank's first growth step redraw the option you did not pick.
    const fragment = makeFragment(mulberry32(5), 5);
    const state = marimoFromFragment(fragment, T0);
    state.bias[0] = 99;
    expect(fragment.bias[0]).not.toBe(99);
  });
});
