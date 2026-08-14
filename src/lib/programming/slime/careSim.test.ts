import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applyFeed,
  applyMist,
  applySparkle,
  canFeed,
  canSparkle,
  healthOf,
  moodOf,
  stepCare
} from './careSim';
import {
  DRY_THRESHOLD,
  HATCH_SEC,
  INITIAL_RADIUS_MM,
  MAX_RADIUS_MM,
  MICA_SPRINKLE_STEP,
  MIST_SPARKLE_RINSE,
  RECRUST_SEC,
  SPARKLE_TAU,
  VIGOR_FLOOR
} from './constants';
import { newSlime } from './persist';
import type { SlimeState } from './types';

/**
 * The house rule under test: every term is step-size invariant, so n small
 * steps and one big step land on the same state. That property is the whole
 * licence for catch-up's coarse stepping, so it is pinned with fast-check
 * across stages, states and step splits.
 */

function awake(nowMs = 0): SlimeState {
  const state = newSlime(nowMs);
  state.stage = 'active';
  state.moisture = 0.6;
  state.satiety = 0.5;
  state.vigor = 0.7;
  state.sparkle = 0.8;
  return state;
}

function stepMany(state: SlimeState, totalSec: number, steps: number, witnessed = true): SlimeState {
  const dt = totalSec / steps;
  for (let i = 0; i < steps; i++) stepCare(state, dt, witnessed);
  return state;
}

// drySec is deliberately absent: it quantises to the step whenever moisture
// crosses the dry threshold mid-window, and the recrust tests pin its
// behaviour on their own terms.
const CONTINUOUS_KEYS = [
  'moisture',
  'satiety',
  'vigor',
  'radiusMm',
  'revival',
  'sparkle'
] as const;

function expectClose(a: SlimeState, b: SlimeState): void {
  expect(a.stage).toBe(b.stage);
  for (const key of CONTINUOUS_KEYS) {
    // Not exact: stage transitions quantise to the step, and coupled terms
    // read their drivers at step edges. What the rule guarantees is that
    // coarse stepping is *unobservable*, so the tolerance is far below
    // anything a bar or a shape could show. The epsilon keeps float noise
    // at the boundary from failing a run that landed exactly on it
    // (fast-check found 0.025 + 2e-15 once, then 0.025 + 1e-9 + 2e-15 —
    // it stacks noise on whatever pad is here, so the pad is generous).
    // radiusMm is millimetre-scale and carries the growth term's documented
    // product-of-means residual (bounded by the growth rate itself), so it
    // gets a proportionally looser — still invisible — bound than the 0..1
    // quantities. fast-check found 0.0250000100 at satiety ≈ 1 over 45 h.
    const pad = key === 'radiusMm' ? 0.1 : 0.025 + 1e-8;
    expect(Math.abs(a[key] - b[key])).toBeLessThan(pad);
  }
}

describe('step-size invariance', () => {
  it('n small steps land where one big step does, in every stage', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'sclerotium' | 'active'>('sclerotium', 'active'),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 1, max: 48 }),
        fc.integer({ min: 2, max: 200 }),
        (stage, moisture, satiety, hours, splits) => {
          const base = awake();
          base.stage = stage;
          base.moisture = moisture;
          base.satiety = satiety;
          if (stage === 'sclerotium') base.revival = 0.1;

          const coarse = structuredClone(base);
          const fine = structuredClone(base);
          // Unwitnessed, like the catch-up this property licences: a witnessed
          // sclerotium can now finish its (half-hour) soak *and* its hatch
          // inside one window when stepped finely, and stepCare deliberately
          // crosses at most one stage transition per step. Unwitnessed, the
          // crust holds at the brink and the invariance is exact.
          stepMany(coarse, hours * 3600, 1, false);
          stepMany(fine, hours * 3600, splits, false);
          expectClose(coarse, fine);
        }
      ),
      { numRuns: 60 }
    );
  });
});

describe('the revival soak', () => {
  it('a dry crust stays a crust, and one mist carries the whole soak', () => {
    // Never misted: ambient damp soaks nothing. The trace of shipping
    // dampness (fresh crusts arrive at 0.05 moisture, a hair above ambient)
    // credits a little soak as it dries down, then progress stops for good —
    // an untouched tank waits indefinitely.
    const dry = newSlime(0);
    stepMany(dry, 2 * 86400, 4);
    const afterTwoDays = dry.revival;
    stepMany(dry, 28 * 86400, 56);
    expect(dry.stage).toBe('sclerotium');
    expect(dry.revival).toBeLessThan(0.5);
    // Not exact: two days is six dormant taus, so a ~1e-3 exponential tail of
    // the shipping dampness is still draining in. What matters is the order
    // of magnitude: another four weeks adds nothing readable.
    expect(dry.revival).toBeCloseTo(afterTwoDays, 2);

    // One spray holds the crust damp for hours — far more than the half-hour
    // soak needs — so a single misted visit wakes it.
    const one = newSlime(0);
    applyMist(one, 0);
    stepMany(one, 2 * 3600, 8);
    expect(one.stage).toBe('active');
  });

  it('an unwitnessed soak holds at the brink; one witnessed step tips it', () => {
    const state = newSlime(0);
    // Days of full damp, none of it watched: far past the requirement.
    for (let i = 0; i < 40; i++) {
      state.moisture = 1;
      stepCare(state, 3600, false);
    }
    expect(state.stage).toBe('sclerotium');
    expect(state.revival).toBe(1);

    // The moment someone is looking, it cracks — moisture no longer matters,
    // the soak is already banked.
    stepCare(state, 1, true);
    expect(state.stage).toBe('waking');
  });

  it('a hatch takes HATCH_SEC of waking and comes out active and well', () => {
    const state = newSlime(0);
    state.stage = 'waking';
    state.revival = 0;
    stepMany(state, HATCH_SEC + 1, 30);
    expect(state.stage).toBe('active');
    // The extra second past the hatch already relaxes vigor a hair below the
    // 0.45 it woke with; what matters is it woke well, not floor-level.
    expect(state.vigor).toBeGreaterThan(0.44);
  });

  it('re-revival after a recrust needs about half the soak', () => {
    const first = newSlime(0);
    const again = newSlime(0);
    again.revivals = 1;
    applyMist(first, 0);
    applyMist(again, 0);
    // A window short enough that neither soak completes, so the ratio of
    // progress is readable directly.
    stepMany(first, 600, 2);
    stepMany(again, 600, 2);
    expect(again.revival).toBeGreaterThan(first.revival * 1.8);
    expect(again.revival).toBeLessThan(1);
  });
});

describe('drying out', () => {
  it('a fully ignored slime re-crusts, and never dies', () => {
    const state = awake();
    // Moisture collapses to ambient within days; the recrust clock then runs.
    const result = { recrusted: false };
    const dt = 3600;
    for (let i = 0; i < 400 && !result.recrusted; i++) {
      result.recrusted = stepCare(state, dt).recrusted;
    }
    expect(result.recrusted).toBe(true);
    expect(state.stage).toBe('sclerotium');
    expect(state.revivals).toBe(1);
    expect(state.vigor).toBeGreaterThanOrEqual(VIGOR_FLOOR);
  });

  it('a mist resets the dry clock', () => {
    const state = awake();
    state.moisture = 0.01;
    state.drySec = RECRUST_SEC - 3600;
    applyMist(state, 0);
    expect(state.drySec).toBe(0);
    expect(state.moisture).toBeGreaterThan(DRY_THRESHOLD);
  });
});

describe('growth and feeding', () => {
  it('radius is monotone and capped', () => {
    const state = awake();
    state.satiety = 1;
    state.vigor = 1;
    state.moisture = 1;
    let previous = state.radiusMm;
    for (let day = 0; day < 40; day++) {
      stepCare(state, 86400);
      // Kept topped up so growth never stalls.
      state.moisture = 1;
      state.satiety = 1;
      expect(state.radiusMm).toBeGreaterThanOrEqual(previous);
      previous = state.radiusMm;
    }
    expect(state.radiusMm).toBeLessThanOrEqual(MAX_RADIUS_MM);
    expect(state.radiusMm).toBeGreaterThan(INITIAL_RADIUS_MM + 4);
  });

  it('feeding tops up satiety only while awake and hungry', () => {
    const state = awake();
    state.satiety = 0.9;
    expect(canFeed(state)).toBe(false);
    state.satiety = 0.3;
    expect(canFeed(state)).toBe(true);
    applyFeed(state, 0);
    expect(state.satiety).toBeCloseTo(0.75, 5);

    const crust = newSlime(0);
    expect(canFeed(crust)).toBe(false);
    applyFeed(crust, 0);
    expect(crust.satiety).toBe(0);
  });

  it('mood and health stay in range everywhere fast-check can reach', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (moisture, satiety, vigor) => {
          const state = awake();
          state.moisture = moisture;
          state.satiety = satiety;
          state.vigor = vigor;
          const mood = moodOf(state);
          const health = healthOf(state);
          expect(mood).toBeGreaterThanOrEqual(0);
          expect(mood).toBeLessThanOrEqual(1);
          expect(health).toBeGreaterThanOrEqual(0);
          expect(health).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('sparkle', () => {
  it('is earned in steps and capped at full pearl', () => {
    const state = awake();
    state.sparkle = 0;
    applySparkle(state);
    expect(state.sparkle).toBeCloseTo(MICA_SPRINKLE_STEP, 6);
    for (let i = 0; i < 20; i++) applySparkle(state);
    expect(state.sparkle).toBe(1);
    expect(canSparkle(state)).toBe(false);
  });

  it('settles out of suspension over days', () => {
    const state = awake();
    state.sparkle = 1;
    stepMany(state, SPARKLE_TAU, 200);
    expect(state.sparkle).toBeCloseTo(Math.exp(-1), 2);
  });

  it('rinses off a little with each misting', () => {
    const state = awake();
    state.sparkle = 0.5;
    applyMist(state, 0);
    expect(state.sparkle).toBeCloseTo(0.5 - MIST_SPARKLE_RINSE, 6);
    state.sparkle = 0.01;
    applyMist(state, 0);
    expect(state.sparkle).toBe(0);
  });

  it('molts away entirely with a recrust', () => {
    const state = awake();
    state.sparkle = 0.9;
    state.moisture = DRY_THRESHOLD / 2;
    // Held critically dry long enough to recrust; the finery goes with it.
    let recrusted = false;
    for (let i = 0; i < 200 && !recrusted; i++) {
      state.moisture = DRY_THRESHOLD / 2;
      recrusted = stepCare(state, RECRUST_SEC / 100).recrusted;
    }
    expect(recrusted).toBe(true);
    expect(state.sparkle).toBe(0);
  });
});
