import { describe, expect, it } from 'vitest';
import { catchUpToNow } from './catchUp';
import { CATCHUP_MAX_STEPS, SECONDS_PER_YEAR, VIGOR_FLOOR } from './constants';
import { newMarimo } from './persist';
import type { MarimoState } from './types';

const T0 = 1_700_000_000_000;
const DAY_MS = 86_400_000;

function fresh(): MarimoState {
  return newMarimo(T0, 4242);
}

describe('catchUpToNow', () => {
  it('agrees whether you visit daily or once a month', () => {
    // The headline property. A visitor who opens the page every day and one who
    // disappears for a month should find the same marimo waiting.
    const daily = fresh();
    for (let d = 1; d <= 30; d++) catchUpToNow(daily, T0 + d * DAY_MS);

    const absent = fresh();
    const result = catchUpToNow(absent, T0 + 30 * DAY_MS);

    expect(result.anomaly).toBe('none');
    expect(Math.abs(absent.radiusMm / daily.radiusMm - 1)).toBeLessThan(0.01);
    expect(Math.abs(absent.vigor / daily.vigor - 1)).toBeLessThan(0.01);
    expect(Math.abs(absent.fouling - daily.fouling)).toBeLessThan(1e-9);
    expect(Math.abs(absent.dent - daily.dent)).toBeLessThan(1e-9);
  });

  it('is a silent no-op when the clock goes backwards', () => {
    // DST, a flight, an NTP resync. Common, accidental, and never punished.
    const state = fresh();
    catchUpToNow(state, T0 + 5 * DAY_MS);
    const snapshot = structuredClone(state);

    const result = catchUpToNow(state, T0 + 4 * DAY_MS);
    expect(result.anomaly).toBe('clock-backwards');
    expect(result.steps).toBe(0);
    expect(result.ventCount).toBe(0);

    expect(state.lastTickAt).toBe(T0 + 4 * DAY_MS);
    expect(state.radiusMm).toBe(snapshot.radiusMm);
    expect(state.vigor).toBe(snapshot.vigor);
    expect(state.fouling).toBe(snapshot.fouling);
    expect(state.dent).toBe(snapshot.dent);
  });

  it('does nothing for sub-second elapsed time but still re-anchors', () => {
    const state = fresh();
    const before = state.radiusMm;
    const result = catchUpToNow(state, T0 + 400);
    expect(result.steps).toBe(0);
    expect(state.radiusMm).toBe(before);
    expect(state.lastTickAt).toBe(T0 + 400);
  });

  it('bounds work rather than elapsed time', () => {
    const state = fresh();
    const result = catchUpToNow(state, T0 + 5 * SECONDS_PER_YEAR * 1000);
    expect(result.steps).toBe(CATCHUP_MAX_STEPS);
    expect(result.anomaly).toBe('step-bounded');
    // Growth is preserved, not silently discarded, which is the whole point of
    // capping steps instead of capping elapsed time.
    expect(state.radiusMm).toBeGreaterThan(20);
  });

  it('survives an absurd clock without hanging or producing NaN', () => {
    const state = fresh();
    const result = catchUpToNow(state, T0 + 200 * SECONDS_PER_YEAR * 1000);
    expect(result.steps).toBeLessThanOrEqual(CATCHUP_MAX_STEPS);
    expect(Number.isFinite(state.radiusMm)).toBe(true);
    expect(Number.isFinite(state.vigor)).toBe(true);
    expect(Number.isFinite(state.gas)).toBe(true);
    expect(state.gas).toBeGreaterThanOrEqual(0);
    expect(state.gas).toBeLessThanOrEqual(1);
    expect(state.vigor).toBeGreaterThanOrEqual(VIGOR_FLOOR);
    expect(Number.isFinite(state.dent)).toBe(true);
  });

  it('handles a NaN timestamp as a clock anomaly', () => {
    const state = fresh();
    const result = catchUpToNow(state, Number.NaN);
    expect(result.anomaly).toBe('clock-backwards');
    expect(Number.isFinite(state.radiusMm)).toBe(true);
  });

  it('reports a plausible number of vent cycles for a day away', () => {
    const state = fresh();
    const result = catchUpToNow(state, T0 + DAY_MS);
    // Roughly 2.5 h to fill from empty, so a handful of surfacings per day.
    expect(result.ventCount).toBeGreaterThan(2);
    expect(result.ventCount).toBeLessThan(20);
  });

  it('is deterministic', () => {
    const runOnce = () => {
      const state = fresh();
      catchUpToNow(state, T0 + 17 * DAY_MS);
      return JSON.stringify(state);
    };
    expect(runOnce()).toBe(runOnce());
  });

  it('always leaves lastTickAt at the supplied time', () => {
    for (const offset of [0, 500, 5000, DAY_MS, 400 * DAY_MS]) {
      const state = fresh();
      catchUpToNow(state, T0 + offset);
      expect(state.lastTickAt).toBe(T0 + offset);
    }
  });
});
