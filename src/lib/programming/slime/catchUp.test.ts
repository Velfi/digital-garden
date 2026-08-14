import { describe, expect, it } from 'vitest';
import { applyMist } from './careSim';
import { HATCH_SEC } from './constants';
import { catchUpToNow } from './catchUp';
import { newSlime } from './persist';

describe('catching up with the wall clock', () => {
  it('a backwards clock re-anchors and never punishes', () => {
    const state = newSlime(1_000_000);
    state.moisture = 0.5;
    const result = catchUpToNow(state, 500_000);
    expect(result.anomaly).toBe('clock-backwards');
    expect(state.moisture).toBe(0.5);
    expect(state.lastTickAt).toBe(500_000);
  });

  it('closing the page mid-hatch completes it silently', () => {
    const state = newSlime(0);
    state.stage = 'waking';
    state.revival = 0.3;
    state.lastTickAt = 0;
    // Unwitnessed, like a real absence: a hatch that already *began* on
    // screen still finishes offscreen — they saw it start, which is the
    // part the witnessed gate protects.
    const result = catchUpToNow(state, (HATCH_SEC + 5) * 1000, { witnessed: false });
    expect(result.hatched).toBe(true);
    expect(state.stage).toBe('active');
  });

  it('a long absence is bounded in steps, not shortened in time', () => {
    const state = newSlime(0);
    state.stage = 'active';
    state.moisture = 1;
    state.lastTickAt = 0;
    const fiveYears = 5 * 365 * 86400 * 1000;
    const result = catchUpToNow(state, fiveYears);
    expect(result.elapsedSec).toBeCloseTo(fiveYears / 1000, 3);
    expect(result.steps).toBeLessThanOrEqual(4000);
    // Five dry years: it re-crusted along the way and is waiting.
    expect(result.recrusted).toBe(true);
    expect(state.stage).toBe('sclerotium');
  });

  it('the mist-and-return arc finishes the soak, and the hatch waits to be seen', () => {
    const state = newSlime(0);
    let clock = 0;
    for (let visit = 0; visit < 5 && state.revival < 1; visit++) {
      applyMist(state, clock);
      clock += 9 * 3600 * 1000;
      catchUpToNow(state, clock, { witnessed: false });
    }
    // The absences completed the soak but never the hatch: the crust holds
    // at the brink until somebody is in front of the glass.
    expect(state.stage).toBe('sclerotium');
    expect(state.revival).toBe(1);

    // The first witnessed second — a visitor back at the tank — tips it.
    clock += 1000;
    const seen = catchUpToNow(state, clock);
    expect(state.stage).toBe('waking');
    // The hatch has *begun*, in front of them; it has not finished.
    expect(seen.hatched).toBe(false);
  });
});
