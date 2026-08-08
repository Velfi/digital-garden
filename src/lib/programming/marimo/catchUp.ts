/**
 * Bringing the pet up to date with the wall clock.
 *
 * This is the only way `stepCare` is ever called. A closed laptop lid, a
 * backgrounded tab, and a month-long absence are the same code path with the
 * same tests — the live tick calls this once a second with a tiny elapsed time,
 * and a returning visitor calls it once with a large one.
 */

import { CATCHUP_MAX_ELAPSED_SEC, CATCHUP_MAX_STEPS, CATCHUP_TARGET_STEP_SEC } from './constants';
import { IDLE_CARE_INPUT, stepCare } from './careSim';
import type { CareInput, CatchUpResult, MarimoState } from './types';

export interface CatchUpOptions {
  targetStepSec?: number;
  maxSteps?: number;
  /** What the motion clock saw. Defaults to idle, which is right for offline. */
  input?: CareInput;
}

/**
 * Advance `state` from `state.lastTickAt` to `nowMs`.
 *
 * Note what is bounded: the *step count*, not the elapsed time. Capping elapsed
 * time would silently delete a returning visitor's growth, which is exactly the
 * wrong failure. Bounding steps instead means 90 days away costs 2160 steps of
 * an hour each, and 5 years costs 4000 steps of 11 hours each — and in the long
 * case the state has already saturated, so the coarser step is unobservable
 * while the linear growth term stays exact regardless of `dt`.
 *
 * 4000 steps is well under a millisecond. There is no freeze, for any elapsed
 * time.
 */
export function catchUpToNow(
  state: MarimoState,
  nowMs: number,
  options: CatchUpOptions = {}
): CatchUpResult {
  const targetStep = options.targetStepSec ?? CATCHUP_TARGET_STEP_SEC;
  const maxSteps = options.maxSteps ?? CATCHUP_MAX_STEPS;
  const input = options.input ?? IDLE_CARE_INPUT;

  let elapsed = (nowMs - state.lastTickAt) / 1000;

  // Clock went backwards: DST, a flight, an NTP resync. Common and accidental.
  // Re-anchor and do nothing else — never punish this.
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    state.lastTickAt = nowMs;
    return { elapsedSec: 0, steps: 0, ventCount: 0, anomaly: 'clock-backwards' };
  }

  if (elapsed > CATCHUP_MAX_ELAPSED_SEC) elapsed = CATCHUP_MAX_ELAPSED_SEC;

  if (elapsed < 1) {
    state.lastTickAt = nowMs;
    return { elapsedSec: elapsed, steps: 0, ventCount: 0, anomaly: 'none' };
  }

  const wanted = Math.ceil(elapsed / targetStep);
  const steps = Math.min(wanted, maxSteps);
  const dt = elapsed / steps;

  let ventCount = 0;
  for (let i = 0; i < steps; i++) {
    ventCount += stepCare(state, dt, input);
  }

  state.lastTickAt = nowMs;
  return {
    elapsedSec: elapsed,
    steps,
    ventCount,
    anomaly: wanted > maxSteps ? 'step-bounded' : 'none'
  };
}
