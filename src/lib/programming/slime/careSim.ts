import {
  DRY_THRESHOLD,
  FEED_DISABLED_ABOVE,
  FEED_SATIETY,
  GROWTH_MM_PER_SEC,
  HATCH_SEC,
  HEALTH_FLOOR,
  MAX_RADIUS_MM,
  MICA_SPRINKLE_STEP,
  MIST_MOISTURE,
  MIST_SPARKLE_RINSE,
  MIST_VIGOR_BONUS,
  MOISTURE_AMBIENT,
  MOISTURE_TAU_ACTIVE,
  MOISTURE_TAU_DORMANT,
  RECRUST_SEC,
  REVIVAL_REPEAT_FACTOR,
  REVIVAL_SOAK_HOURS,
  SATIETY_TAU,
  SNACK_SATIETY,
  SPARKLE_TAU,
  VIGOR_FLOOR,
  VIGOR_TAU
} from './constants';
import type { SlimeState } from './types';

/**
 * The care clock: the slow simulation that owns everything persisted.
 *
 * HOUSE RULE, inherited verbatim from the marimo's `careSim.ts`: every term
 * must be step-size invariant — either
 *
 *     x += rate * dt                              (linear, exactly composable)
 *     x += (target - x) * (1 - exp(-dt / tau))    (exact solution of the ODE)
 *
 * plus the one derived form both files need, the *time-mean* of a relaxing
 * quantity over its own step (`relaxMean`), for terms driven by another
 * relaxing term. That rule is what lets `catchUp.ts` advance a fortnight in a
 * few thousand coarse steps and land where a fortnight of one-second ticks
 * would have.
 *
 * The lifecycle is a three-stage machine and this file owns every transition:
 * a `sclerotium` soaks toward `waking` (revival integrates moisture over
 * time, so it genuinely takes returning and re-misting); `waking` is a short
 * scripted hatch; `active` re-crusts back to `sclerotium` only after days of
 * critical dryness. Nothing here can kill the pet — dormancy *is* the floor.
 *
 * One transition is special: the hatch is the payoff of the whole soak arc,
 * and it must not spend itself while nobody is looking. An *unwitnessed*
 * step (absence catch-up, a hidden tab, a tank scrolled out of view) lets
 * revival finish but holds the crust at the brink; the first witnessed step
 * tips it into `waking`, so the visitor is there when it happens.
 */

export function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** The exact relaxation fraction over `dt` for a first-order lag of `tau`. */
export function relaxFraction(dt: number, tau: number): number {
  return 1 - Math.exp(-dt / tau);
}

/** The time-average of a relaxing quantity across the step. See marimo careSim. */
export function relaxMean(from: number, target: number, dt: number, tau: number): number {
  if (!(dt > 0)) return from;
  return target - ((target - from) * relaxFraction(dt, tau) * tau) / dt;
}

/** Overall wellbeing, 0..1, floored — a neglected slime slows, never stops. */
export function healthOf(state: Pick<SlimeState, 'vigor' | 'moisture'>): number {
  return clamp(state.vigor * (0.5 + 0.5 * state.moisture), HEALTH_FLOOR, 1);
}

/** What the eyes and the description read: how it is feeling right now. */
export function moodOf(
  state: Pick<SlimeState, 'vigor' | 'moisture' | 'satiety' | 'stage'>
): number {
  if (state.stage !== 'active') return 0;
  return clamp(0.5 * state.moisture + 0.25 * state.satiety + 0.25 * state.vigor, 0.05, 1);
}

/** The soak a waking needs, seconds of full moisture. Halves once it knows how. */
export function revivalRequirementSec(revivals: number): number {
  const factor = revivals > 0 ? REVIVAL_REPEAT_FACTOR : 1;
  return REVIVAL_SOAK_HOURS * 3600 * factor;
}

export interface StepResult {
  /** The crust finished waking this step. */
  hatched: boolean;
  /** The slime dried out and re-crusted this step. */
  recrusted: boolean;
}

/**
 * Advance the persisted state by `dt` seconds. Mutates in place.
 *
 * A step never crosses more than one stage transition: the hatch takes
 * `HATCH_SEC` and catch-up finishes it silently on the next step, which is
 * both simpler and right — a visitor who left mid-hatch comes back to an
 * awake slime, not to a replayed animation. (They saw it *start* — the
 * `witnessed` gate below guarantees that much.)
 *
 * `witnessed` is whether someone is actually looking at the tank this step.
 * It gates exactly one thing: a finished soak only cracks into `waking` on a
 * witnessed step. Everything continuous integrates identically either way,
 * so the step-size-invariance house rule is untouched.
 */
export function stepCare(state: SlimeState, dt: number, witnessed = true): StepResult {
  const result: StepResult = { hatched: false, recrusted: false };
  if (!(dt > 0)) return result;

  const moistureTau = state.stage === 'active' ? MOISTURE_TAU_ACTIVE : MOISTURE_TAU_DORMANT;
  const moistureBefore = state.moisture;
  state.moisture += (MOISTURE_AMBIENT - state.moisture) * relaxFraction(dt, moistureTau);
  state.moisture = clamp(state.moisture, 0, 1);

  if (state.stage === 'sclerotium') {
    // Revival integrates moisture *above ambient* over time — the mean over
    // the step, so a coarse catch-up step credits exactly the soak the fine
    // steps would. Ambient is subtracted out (and the scale renormalised so
    // full moisture still soaks at rate 1): tank humidity alone never wakes
    // it, only misting does. The max() stays exact because moisture relaxes
    // toward ambient without ever crossing it mid-step.
    const meanMoisture = relaxMean(moistureBefore, MOISTURE_AMBIENT, dt, moistureTau);
    const soakDrive = Math.max(0, meanMoisture - MOISTURE_AMBIENT) / (1 - MOISTURE_AMBIENT);
    state.revival += (soakDrive * dt) / revivalRequirementSec(state.revivals);
    if (state.revival >= 1) {
      if (witnessed) {
        state.stage = 'waking';
        state.revival = 0;
      } else {
        // Fully soaked but nobody watching: hold at the brink. The clamp
        // costs nothing — extra soak past ready was always discarded.
        state.revival = 1;
      }
    }
    // A crust neither eats nor grows; vigor rests at the floor.
    state.vigor = clamp(
      state.vigor + (VIGOR_FLOOR - state.vigor) * relaxFraction(dt, VIGOR_TAU),
      VIGOR_FLOOR,
      1
    );
    state.drySec = 0;
    return result;
  }

  if (state.stage === 'waking') {
    state.revival = clamp(state.revival + dt / HATCH_SEC, 0, 1);
    if (state.revival >= 1) {
      state.stage = 'active';
      state.revival = 0;
      // It wakes up small-ly fine but hungry and only just damp enough.
      state.vigor = Math.max(state.vigor, 0.45);
      result.hatched = true;
    }
    return result;
  }

  // --- active ---------------------------------------------------------------
  const satietyBefore = state.satiety;
  state.satiety += (0 - state.satiety) * relaxFraction(dt, SATIETY_TAU);
  state.satiety = clamp(state.satiety, 0, 1);

  // The mica settles out of suspension: sparkle relaxes toward plain jelly
  // on its own slow clock, so a pearled pet wants the occasional re-pinch.
  state.sparkle = clamp(state.sparkle * (1 - relaxFraction(dt, SPARKLE_TAU)), 0, 1);

  // Vigor chases a target built from moisture and satiety, which are
  // themselves relaxing — a linear ODE driven by two exponentials, and it is
  // solved *in closed form* rather than stepped against a frozen target.
  // Reading end-of-step values made an hour-coarse catch-up measurably
  // gloomier than the same hours ticked finely (the property test caught
  // it), and the mean-target refinement still carried a residual at long
  // steps. The exact solution composes perfectly, which is the house rule.
  //
  // The target's clamp turns out to be decorative — its minimum possible
  // value (bone dry, starving) is 0.265, above VIGOR_FLOOR, and its maximum
  // is exactly 1 — so the unclamped ODE is the true dynamics:
  //
  //   v' = (T(t) − v)/τv,  T(t) = A + Dm·e^(−t/τm) + Ds·e^(−t/τs)
  //   v(dt) = A + pm·em + ps·es + (v0 − A − pm − ps)·ev
  //   with pk = Dk·τk/(τk − τv), ek = e^(−dt/τk).
  const A = 0.25 + 0.5 * MOISTURE_AMBIENT;
  const pm = 0.5 * (moistureBefore - MOISTURE_AMBIENT) * (moistureTau / (moistureTau - VIGOR_TAU));
  const ps = 0.25 * satietyBefore * (SATIETY_TAU / (SATIETY_TAU - VIGOR_TAU));
  const em = Math.exp(-dt / moistureTau);
  const es = Math.exp(-dt / SATIETY_TAU);
  const ev = Math.exp(-dt / VIGOR_TAU);
  const vigorBefore = state.vigor;
  const free = vigorBefore - A - pm - ps;
  state.vigor = clamp(A + pm * em + ps * es + free * ev, VIGOR_FLOOR, 1);

  // Growth: monotone, fed by being fed. Its coefficient is the time-mean of
  // the same closed-form trajectory (each term integrated exactly); the
  // product-of-means approximation that remains is bounded by the growth
  // rate itself — half a millimetre a day at best.
  const meanOf = (e: number, tau: number) => (tau / dt) * (1 - e);
  const meanVigor = clamp(
    A + pm * meanOf(em, moistureTau) + ps * meanOf(es, SATIETY_TAU) + free * meanOf(ev, VIGOR_TAU),
    VIGOR_FLOOR,
    1
  );
  const meanMoisture = relaxMean(moistureBefore, MOISTURE_AMBIENT, dt, moistureTau);
  const meanSatiety = relaxMean(satietyBefore, 0, dt, SATIETY_TAU);
  const meanHealth = clamp(meanVigor * (0.5 + 0.5 * meanMoisture), HEALTH_FLOOR, 1);
  state.radiusMm = Math.min(
    MAX_RADIUS_MM,
    state.radiusMm + GROWTH_MM_PER_SEC * meanHealth * meanSatiety * dt
  );

  // The recrust clock only runs while critically dry, and resets wet.
  if (state.moisture < DRY_THRESHOLD) {
    state.drySec += dt;
    if (state.drySec >= RECRUST_SEC) {
      state.stage = 'sclerotium';
      state.revival = 0;
      state.revivals += 1;
      state.drySec = 0;
      state.satiety = 0;
      // The crust molts its finery; a revived slime starts plain.
      state.sparkle = 0;
      result.recrusted = true;
    }
  } else {
    state.drySec = 0;
  }

  return result;
}

/** A spray of mist, in any stage: soak the crust, or freshen the slime. */
export function applyMist(state: SlimeState, nowMs: number): void {
  state.moisture = clamp(state.moisture + MIST_MOISTURE, 0, 1);
  // The rinse: a spray washes a little glitter off with it.
  state.sparkle = clamp(state.sparkle - MIST_SPARKLE_RINSE, 0, 1);
  if (state.stage === 'active') {
    state.vigor = clamp(state.vigor + MIST_VIGOR_BONUS, VIGOR_FLOOR, 1);
  }
  state.drySec = 0;
  state.lastMistAt = nowMs;
}

/** Whether the flake button should be offered at all. */
export function canFeed(state: SlimeState): boolean {
  return state.stage === 'active' && state.satiety < FEED_DISABLED_ABOVE;
}

/** Whether a pinch of mica would take: awake, and not yet at full pearl. */
export function canSparkle(state: SlimeState): boolean {
  return state.stage === 'active' && state.sparkle < 1;
}

/** A pinch of mica flakes, folded in. Earned, then slowly lost — it settles
 * with time, rinses off under the mister, and molts away with a recrust. */
export function applySparkle(state: SlimeState): void {
  if (state.stage !== 'active') return;
  state.sparkle = clamp(state.sparkle + MICA_SPRINKLE_STEP, 0, 1);
}

/** An oat flake, engulfed. The scene calls this when the engulf completes. */
export function applyFeed(state: SlimeState, nowMs: number): void {
  if (state.stage !== 'active') return;
  state.satiety = clamp(state.satiety + FEED_SATIETY, 0, 1);
  state.lastFedAt = nowMs;
}

/** A live springtail, caught under the skirt: a morsel, same rules as a meal. */
export function applySnack(state: SlimeState, nowMs: number): void {
  if (state.stage !== 'active') return;
  state.satiety = clamp(state.satiety + SNACK_SATIETY, 0, 1);
  state.lastFedAt = nowMs;
}
