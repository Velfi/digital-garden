import { describe, expect, it } from 'vitest';
import {
  IDLE_CARE_INPUT,
  advanceGas,
  applySqueeze,
  applyWaterChange,
  healthOf,
  photosynthesisRate,
  relaxMean,
  shapeOf,
  stepCare
} from './careSim';
import { neutralGas } from './buoyancy';
import {
  BIAS_MAX,
  DENT_MAX,
  FACET_MAX_DEPTH,
  FACET_MERGE_COS,
  MAX_FACETS,
  GAS_AFTER_VENT,
  HEALTH_FLOOR,
  MAX_RINGS,
  SECONDS_PER_YEAR,
  TURN_CREDIT_FOR_FULL_ROUNDING,
  VENT_THRESHOLD,
  VIGOR_FLOOR
} from './constants';
import { surfaceScale } from './facets';
import { newMarimo } from './persist';
import { mulberry32 } from './rng';
import {
  DENT_UNIT_NORM,
  dentCoefficients,
  radiusScaleAt,
  shapeMagnitude
} from './sphericalHarmonics';
import type { MarimoState } from './types';

const T0 = 1_700_000_000_000;

function fresh(): MarimoState {
  return newMarimo(T0, 12345);
}

function run(state: MarimoState, totalSec: number, stepSec: number): number {
  let vents = 0;
  const steps = Math.round(totalSec / stepSec);
  for (let i = 0; i < steps; i++) vents += stepCare(state, stepSec, IDLE_CARE_INPUT);
  return vents;
}

/**
 * A marimo whose water is actually being changed, so it grows at close to full
 * speed. Neglect is self-limiting — it slows growth to the floor — so a *cared
 * for* marimo is the one that can bake a shape in fastest.
 */
function runTended(state: MarimoState, totalSec: number, stepSec: number, spin: number): void {
  const steps = Math.round(totalSec / stepSec);
  let sinceChange = 0;
  for (let i = 0; i < steps; i++) {
    stepCare(state, stepSec, { spin });
    sinceChange += stepSec;
    if (sinceChange >= 5 * 86400) {
      applyWaterChange(state, T0 + i * stepSec * 1000);
      sinceChange = 0;
    }
  }
}

/** Permanent radial deviation on the side that has been resting, negative when flat. */
function restingBias(state: MarimoState): number {
  return radiusScaleAt(state.bias, state.restDir[0], state.restDir[1], state.restDir[2]) - 1;
}

/** Depth of the grown-in flat facing the way it has been resting, or 0. */
function restingFacet(state: MarimoState): number {
  let depth = 0;
  for (const facet of state.facets) {
    const towards =
      facet.d[0] * state.restDir[0] + facet.d[1] * state.restDir[1] + facet.d[2] * state.restDir[2];
    if (towards > FACET_MERGE_COS) depth = Math.max(depth, facet.depth);
  }
  return depth;
}

/** How far the surface actually is from round on the resting side, as drawn. */
function restingSurface(state: MarimoState): number {
  const shape = shapeOf(state);
  return surfaceScale(shape, state.restDir[0], state.restDir[1], state.restDir[2]) - 1;
}

/** A plausible but arbitrary mid-life state, for property checks. */
function randomState(rand: () => number): MarimoState {
  const s = fresh();
  s.radiusMm = 12 + rand() * 40;
  s.vigor = VIGOR_FLOOR + rand() * (1 - VIGOR_FLOOR);
  s.gas = rand();
  s.fouling = rand();
  s.dent = rand() * DENT_MAX;
  s.turnCredit = rand() * 0.3;
  const z = 2 * rand() - 1;
  const t = 2 * Math.PI * rand();
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  s.restDir = [r * Math.cos(t), r * Math.sin(t), z];
  return s;
}

describe('advanceGas', () => {
  it('fills toward the vent threshold and cycles', () => {
    const result = advanceGas(0, 1, 24 * 3600);
    expect(result.vents).toBeGreaterThan(2);
    expect(result.gas).toBeGreaterThanOrEqual(0);
    expect(result.gas).toBeLessThanOrEqual(1);
  });

  it('never vents when health is too low to reach the threshold', () => {
    // A badly neglected marimo stops surfacing. That is the intended signal.
    const result = advanceGas(0, HEALTH_FLOOR, 30 * 86400);
    expect(result.vents).toBe(0);
    expect(result.gas).toBeLessThan(VENT_THRESHOLD);
  });

  it('leaves a neglected marimo below neutral buoyancy, sitting on the gravel', () => {
    // The bug this guards: a linear health-to-oxygen map left even a dying
    // marimo bobbing at the surface, which reads as thriving.
    const sick = advanceGas(0.9, HEALTH_FLOOR, 30 * 86400);
    expect(sick.gas).toBeLessThan(neutralGas());

    const healthy = advanceGas(0, 1, 30 * 86400);
    expect(healthy.vents).toBeGreaterThan(50);
  });

  it('ramps oxygen production from none to full across the health range', () => {
    expect(photosynthesisRate(HEALTH_FLOOR)).toBeLessThan(0.1);
    expect(photosynthesisRate(1)).toBe(1);
    expect(photosynthesisRate(0.5)).toBeGreaterThan(photosynthesisRate(0.3));
  });

  it('drops to the post-vent level immediately when already over threshold', () => {
    const result = advanceGas(0.95, 1, 1);
    expect(result.vents).toBe(1);
    expect(result.gas).toBeCloseTo(GAS_AFTER_VENT, 6);
  });

  it('preserves cycle phase - splitting the interval gives the same answer', () => {
    const once = advanceGas(0.2, 1, 6 * 3600);
    let gas = 0.2;
    let vents = 0;
    for (let i = 0; i < 6; i++) {
      const r = advanceGas(gas, 1, 3600);
      gas = r.gas;
      vents += r.vents;
    }
    expect(vents).toBe(once.vents);
    expect(gas).toBeCloseTo(once.gas, 6);
  });

  it('stays in range for absurd inputs', () => {
    for (const dt of [0, 1, 1e6, 1e9]) {
      for (const health of [HEALTH_FLOOR, 0.5, 1]) {
        const r = advanceGas(0.5, health, dt);
        expect(r.gas).toBeGreaterThanOrEqual(0);
        expect(r.gas).toBeLessThanOrEqual(1);
        expect(Number.isFinite(r.gas)).toBe(true);
      }
    }
  });
});

describe('stepCare step-size invariance', () => {
  // The house rule for careSim.ts is that every term is either linear in dt or
  // an exact first-order relaxation, so coarse steps and fine steps agree.
  // Where a relaxation target itself drifts (vigor chases fouling, growth
  // scales with health) the agreement is very close rather than exact.
  it('agrees between one-second and one-hour steps over a month', () => {
    const month = 30 * 86400;
    const fine = fresh();
    const coarse = fresh();
    run(fine, month, 60);
    run(coarse, month, 3600);

    // Exactly composable: constant relaxation target.
    expect(coarse.fouling).toBeCloseTo(fine.fouling, 12);
    expect(coarse.turnCredit).toBeCloseTo(fine.turnCredit, 12);
    expect(coarse.dent).toBeCloseTo(fine.dent, 10);

    // Drifting target: close, not exact.
    expect(Math.abs(coarse.vigor / fine.vigor - 1)).toBeLessThan(0.01);
    expect(Math.abs(coarse.radiusMm / fine.radiusMm - 1)).toBeLessThan(0.01);

    // The grown-in flat is driven by growth, so it inherits that same drift and
    // no more. This is the term with the most to prove: it accumulates through
    // `relaxMean`, so getting it wrong would mean a month away from the tab
    // baking in a different marimo from a month spent watching.
    expect(coarse.facets).toHaveLength(fine.facets.length);
    expect(Math.abs(restingFacet(coarse) / restingFacet(fine) - 1)).toBeLessThan(0.01);

    // Gas is genuinely cyclic on a scale of hours, so its final *phase* after a
    // month is not meaningfully comparable between step sizes. Only the range
    // and the rough cycle count are contractual.
    expect(coarse.gas).toBeGreaterThanOrEqual(0);
    expect(coarse.gas).toBeLessThanOrEqual(1);
  });

  it('holds for randomised starting states', () => {
    const rand = mulberry32(0xbadc0de);
    for (let trial = 0; trial < 25; trial++) {
      const seedState = randomState(rand);
      const fine = structuredClone(seedState);
      const coarse = structuredClone(seedState);
      run(fine, 7 * 86400, 300);
      run(coarse, 7 * 86400, 3600);
      expect(Math.abs(coarse.fouling - fine.fouling)).toBeLessThan(1e-9);
      expect(Math.abs(coarse.vigor - fine.vigor)).toBeLessThan(0.01);
      expect(Math.abs(coarse.radiusMm / fine.radiusMm - 1)).toBeLessThan(0.01);
      // Absolute, not relative: `randomState` can start at the maximum radius,
      // where growth is clamped and the shape correctly never moves at all.
      expect(Math.abs(shapeMagnitude(coarse.bias) - shapeMagnitude(fine.bias))).toBeLessThan(2e-4);
    }
  });
});

describe('relaxMean', () => {
  // The closed form that keeps one relaxing quantity driving another without
  // making the result depend on step size.
  const cases = [
    { from: 0, target: 0.16, tau: 2 * 86400 },
    { from: 0.16, target: 0, tau: 90 },
    { from: 0.04, target: 0.11, tau: 3600 }
  ];

  it('matches numerical integration of the same relaxation', () => {
    // Stepped in multiples of tau rather than in seconds: dt/tau is the only
    // thing the answer depends on, and it keeps the reference quadrature
    // resolving the decay it is integrating.
    for (const { from, target, tau } of cases) {
      for (const ratio of [0.01, 0.1, 1, 5, 50]) {
        const dt = ratio * tau;
        const slices = 20000;
        let sum = 0;
        for (let i = 0; i < slices; i++) {
          const t = ((i + 0.5) / slices) * dt;
          sum += target + (from - target) * Math.exp(-t / tau);
        }
        const numeric = sum / slices;
        expect(Math.abs(relaxMean(from, target, dt, tau) / numeric - 1)).toBeLessThan(1e-6);
      }
    }
  });

  it('tends to the starting value for a short step and the target for a long one', () => {
    expect(relaxMean(0.02, 0.16, 1e-6, 86400)).toBeCloseTo(0.02, 6);
    // Approaches the target as tau/dt, so a step ten thousand time constants
    // long is still a hair under it.
    expect(relaxMean(0.02, 0.16, 1e6, 90)).toBeCloseTo(0.16, 4);
    // Degenerate steps are the caller's problem everywhere else in this file;
    // here they simply hold.
    expect(relaxMean(0.05, 0.16, 0, 90)).toBe(0.05);
  });
});

describe('stepCare invariants', () => {
  it('never lets the marimo die, even after ten years of neglect', () => {
    const state = fresh();
    const startRadius = state.radiusMm;
    run(state, 10 * SECONDS_PER_YEAR, 6 * 3600);

    expect(state.vigor).toBeGreaterThanOrEqual(VIGOR_FLOOR);
    expect(state.radiusMm).toBeGreaterThan(startRadius);
    expect(healthOf(state)).toBeGreaterThanOrEqual(HEALTH_FLOOR);
    expect(Number.isFinite(state.radiusMm)).toBe(true);
    // Fully fouled, fully browned, fully flattened - but alive and growing.
    expect(state.fouling).toBeCloseTo(1, 3);
  });

  it('keeps radius monotone non-decreasing across every step', () => {
    const rand = mulberry32(11);
    const state = randomState(rand);
    let previous = state.radiusMm;
    for (let i = 0; i < 500; i++) {
      stepCare(state, 3600, { spin: rand() });
      expect(state.radiusMm).toBeGreaterThanOrEqual(previous);
      previous = state.radiusMm;
    }
  });

  it('keeps every field in range under random driving', () => {
    const rand = mulberry32(77);
    const state = fresh();
    for (let i = 0; i < 2000; i++) {
      stepCare(state, rand() * 7200, { spin: rand() });
      expect(state.vigor).toBeGreaterThanOrEqual(VIGOR_FLOOR);
      expect(state.vigor).toBeLessThanOrEqual(1);
      expect(state.fouling).toBeGreaterThanOrEqual(0);
      expect(state.fouling).toBeLessThanOrEqual(1);
      expect(state.gas).toBeGreaterThanOrEqual(0);
      expect(state.gas).toBeLessThanOrEqual(1);
      expect(state.turnCredit).toBeGreaterThanOrEqual(0);
      expect(state.turnCredit).toBeLessThanOrEqual(1);
      expect(state.dent).toBeGreaterThanOrEqual(0);
      expect(state.dent).toBeLessThanOrEqual(DENT_MAX);
      expect(state.rings.length).toBeLessThanOrEqual(MAX_RINGS);
      expect(shapeMagnitude(shapeOf(state).coeffs)).toBeLessThan(1);
    }
  });

  it('caps rings and keeps them ordered outward', () => {
    // Neglected growth runs at the health floor, so reaching the ring cap takes
    // rather longer than it would with care.
    const state = fresh();
    run(state, 20 * SECONDS_PER_YEAR, 6 * 3600);
    expect(state.rings.length).toBe(MAX_RINGS);
    for (let i = 1; i < state.rings.length; i++) {
      expect(state.rings[i].r).toBeGreaterThan(state.rings[i - 1].r);
    }
    expect(state.rings.at(-1)!.r).toBeLessThanOrEqual(state.radiusMm);
  });

  it('develops a flat spot when still', () => {
    const state = fresh();
    run(state, 6 * 86400, 3600);
    expect(state.dent).toBeGreaterThan(0.9 * DENT_MAX);
    // And it is a flat, not a bowl: the surface on that side sits a full dent
    // in, rather than the three fifths of one an SH dent used to manage.
    expect(restingSurface(state)).toBeCloseTo(-state.dent, 6);
  });

  it('re-rounds within minutes of actual play, not hours', () => {
    // The mechanic has to be discoverable. An earlier model drained accumulated
    // stillness linearly, which needed about twenty-one hours of continuous
    // rolling to undo a week of neglect.
    const state = fresh();
    run(state, 7 * 86400, 3600);
    const flattened = state.dent;
    expect(flattened).toBeGreaterThan(0.95 * DENT_MAX);

    // Two minutes of enthusiastic rolling.
    for (let i = 0; i < 120; i++) stepCare(state, 1, { spin: 1 });
    expect(state.turnCredit).toBeGreaterThan(TURN_CREDIT_FOR_FULL_ROUNDING);

    // Ten more minutes and it is most of the way back to round.
    for (let i = 0; i < 600; i++) stepCare(state, 1, { spin: 1 });
    expect(state.dent).toBeLessThan(flattened * 0.4);
  });
});

describe('permanent shape', () => {
  const SIX_MONTHS = 180 * 86400;

  it('grows a flat face when a well-fed marimo is never turned', () => {
    // The interesting failure mode is not neglect — neglect slows growth to the
    // floor, so a neglected marimo barely changes shape. It is the marimo whose
    // water gets changed on the dot and which nobody ever picks up.
    const state = fresh();
    runTended(state, SIX_MONTHS, 3600, 0);

    expect(state.dent).toBeGreaterThan(0.95 * DENT_MAX);
    expect(state.facets).toHaveLength(1);
    expect(restingFacet(state)).toBeGreaterThan(0.05);
  });

  it('keeps that face after the transient flat spot has rolled out', () => {
    const state = fresh();
    runTended(state, SIX_MONTHS, 3600, 0);
    const baked = restingFacet(state);

    // An hour of solid rolling: more than enough to undo the dent.
    for (let i = 0; i < 3600; i++) stepCare(state, 1, { spin: 1 });

    expect(state.dent).toBeLessThan(0.005);
    // The flat spot is gone. The flat side is not.
    expect(restingFacet(state)).toBeCloseTo(baked, 3);
    expect(restingSurface(state)).toBeLessThan(-0.05);
  });

  it('turns a marimo that gets put down on a new side into a cushion', () => {
    // Two flats on opposite sides, which is what the pressed ones in the lake
    // look like — and something the old single-dent model could not represent
    // at all, since one dent along `restDir` was the whole of the story.
    const state = fresh();
    runTended(state, SIX_MONTHS, 3600, 0);
    expect(state.facets).toHaveLength(1);

    state.restDir = [-state.restDir[0], -state.restDir[1], -state.restDir[2]];
    runTended(state, SIX_MONTHS, 3600, 0);

    expect(state.facets).toHaveLength(2);
    const [a, b] = state.facets;
    expect(a.d[0] * b.d[0] + a.d[1] * b.d[1] + a.d[2] * b.d[2]).toBeLessThan(-0.9);
    expect(Math.min(a.depth, b.depth)).toBeGreaterThan(0.03);
  });

  it('never collects more faces than the cap allows', () => {
    const rand = mulberry32(0x5ca1ab1e);
    const state = fresh();
    for (let i = 0; i < 40; i++) {
      const z = 2 * rand() - 1;
      const t = 2 * Math.PI * rand();
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      state.restDir = [r * Math.cos(t), r * Math.sin(t), z];
      runTended(state, 30 * 86400, 3600, 0);
      expect(state.facets.length).toBeLessThanOrEqual(MAX_FACETS);
      for (const facet of state.facets) {
        expect(facet.depth).toBeLessThanOrEqual(FACET_MAX_DEPTH + 1e-12);
        expect(Math.hypot(...facet.d)).toBeCloseTo(1, 9);
      }
    }
  });

  it('stays round when it is turned', () => {
    const state = fresh();
    runTended(state, SIX_MONTHS, 3600, 1);

    expect(state.dent).toBeLessThan(0.01);
    expect(state.facets).toHaveLength(0);
    expect(Math.abs(restingBias(state))).toBeLessThan(0.005);
  });

  it('outgrows a flat face without anything erasing it', () => {
    // The same dilution rule the inherited lumpiness gets: the flat keeps its
    // size in millimetres while the ball around it grows, so a marimo that is
    // finally being cared for rounds out over months rather than on command.
    const state = fresh();
    runTended(state, SIX_MONTHS, 3600, 0);
    const baked = restingFacet(state);
    const startRadius = state.radiusMm;
    expect(baked).toBeGreaterThan(0.05);

    runTended(state, 3 * SECONDS_PER_YEAR, 6 * 3600, 1);

    expect(state.radiusMm).toBeGreaterThan(startRadius * 1.5);
    expect(restingFacet(state)).toBeLessThan(baked * 0.6);
    expect(restingFacet(state)).toBeGreaterThan(0);
  });

  it('dilutes an inherited shape as it grows, without ever erasing it', () => {
    // How a ragged starting fragment rounds out: the bump stays the same size in
    // millimetres while the ball around it gets bigger.
    const state = fresh();
    state.bias = dentCoefficients(0, -1, 0, 0.15);
    const before = shapeMagnitude(state.bias);
    const startRadius = state.radiusMm;

    runTended(state, SIX_MONTHS, 3600, 1);

    const ratio = startRadius / state.radiusMm;
    expect(state.radiusMm).toBeGreaterThan(startRadius * 1.5);
    expect(shapeMagnitude(state.bias)).toBeCloseTo(before * ratio, 4);
    expect(shapeMagnitude(state.bias)).toBeGreaterThan(0);
  });

  it('never exceeds the cap, however long it is left', () => {
    const state = fresh();
    runTended(state, 8 * SECONDS_PER_YEAR, 6 * 3600, 0);
    expect(shapeMagnitude(state.bias)).toBeLessThanOrEqual(BIAS_MAX * DENT_UNIT_NORM + 1e-12);
  });
});

describe('care actions', () => {
  it('a water change clears the murk and lifts vigor', () => {
    const state = fresh();
    run(state, 20 * 86400, 3600);
    expect(state.fouling).toBeGreaterThan(0.5);
    const before = state.vigor;

    applyWaterChange(state, T0 + 20 * 86400_000);
    expect(state.fouling).toBe(0);
    expect(state.vigor).toBeGreaterThan(before);
    expect(state.vigor).toBeLessThanOrEqual(1);
    expect(state.lastWaterChangeAt).toBe(T0 + 20 * 86400_000);
  });

  it('a squeeze expels gas and cannot go negative', () => {
    const state = fresh();
    state.gas = 0.9;
    applySqueeze(state);
    expect(state.gas).toBeCloseTo(0.5, 6);
    applySqueeze(state);
    applySqueeze(state);
    expect(state.gas).toBe(0);
  });
});
