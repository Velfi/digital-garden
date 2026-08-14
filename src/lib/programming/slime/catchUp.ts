import { CATCHUP_MAX_ELAPSED_SEC, CATCHUP_MAX_STEPS, CATCHUP_TARGET_STEP_SEC } from './constants';
import { stepCare } from './careSim';
import type { CatchUpResult, SlimeState } from './types';

/**
 * Bringing the pet up to date with the wall clock.
 *
 * Copy-adapted from the marimo's `catchUp.ts` (which imports marimo types and
 * so cannot be shared directly), keeping its two load-bearing decisions:
 * this is the *only* way `stepCare` is ever called — the live one-second tick
 * and a month-long absence are the same code path — and what is bounded is
 * the step *count*, never the elapsed time, so an absence is never silently
 * shortened. 4000 steps is under a millisecond.
 */

export interface CatchUpOptions {
  targetStepSec?: number;
  maxSteps?: number;
  /**
   * Whether someone is looking at the tank for these steps. Defaults to true
   * (the live one-second tick); the absence paths — load, flush, time travel
   * — pass false so a soak that finishes offscreen holds at the brink and
   * the hatch happens in front of the visitor. See `stepCare`.
   */
  witnessed?: boolean;
}

export function catchUpToNow(
  state: SlimeState,
  nowMs: number,
  options: CatchUpOptions = {}
): CatchUpResult {
  const targetStep = options.targetStepSec ?? CATCHUP_TARGET_STEP_SEC;
  const maxSteps = options.maxSteps ?? CATCHUP_MAX_STEPS;
  const witnessed = options.witnessed ?? true;

  let elapsed = (nowMs - state.lastTickAt) / 1000;

  // Clock went backwards: DST, a flight, an NTP resync. Common and accidental.
  // Re-anchor and do nothing else — never punish this.
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    state.lastTickAt = nowMs;
    return {
      elapsedSec: 0,
      steps: 0,
      hatched: false,
      recrusted: false,
      anomaly: 'clock-backwards'
    };
  }

  if (elapsed > CATCHUP_MAX_ELAPSED_SEC) elapsed = CATCHUP_MAX_ELAPSED_SEC;

  if (elapsed < 1) {
    state.lastTickAt = nowMs;
    return { elapsedSec: elapsed, steps: 0, hatched: false, recrusted: false, anomaly: 'none' };
  }

  const wanted = Math.ceil(elapsed / targetStep);
  const steps = Math.min(wanted, maxSteps);
  const dt = elapsed / steps;

  let hatched = false;
  let recrusted = false;
  for (let i = 0; i < steps; i++) {
    const result = stepCare(state, dt, witnessed);
    hatched ||= result.hatched;
    recrusted ||= result.recrusted;
  }

  state.lastTickAt = nowMs;
  return {
    elapsedSec: elapsed,
    steps,
    hatched,
    recrusted,
    anomaly: wanted > maxSteps ? 'step-bounded' : 'none'
  };
}
