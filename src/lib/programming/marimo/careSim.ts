/**
 * The care clock: the slow simulation that owns everything persisted.
 *
 * HOUSE RULE for this file: every term must be step-size invariant, i.e. either
 *
 *     x += rate * dt                              (linear, exactly composable)
 *     x += (target - x) * (1 - exp(-dt / tau))    (exact solution of the ODE)
 *
 * Nothing else. That rule is the entire reason `catchUp.ts` can advance a month
 * in a few thousand coarse steps and land on the same state a month of
 * one-second ticks would have produced — with one integrator, not two.
 *
 * Gas is owned here *including* its vent cycles, resolved in closed form. The
 * motion clock only reacts to gas dropping (bubble burst, sink); it never
 * mutates it. One owner keeps catch-up exact.
 */

import {
  CATCHUP_MAX_VENTS,
  DENT_FORM_TAU,
  DENT_MAX,
  DENT_RECOVER_TAU,
  FACET_AXIS_TRACK,
  FACET_MAX_DEPTH,
  FACET_MERGE_COS,
  FACET_MIN_DEPTH,
  FOUL_TAU,
  GAS_AFTER_VENT,
  GAS_LEAK_TAU,
  GAS_TAU,
  GROWTH_MM_PER_SEC,
  GROWTH_SHADOW,
  HEALTH_FLOOR,
  HEALTH_FOULING_PENALTY,
  MAX_FACETS,
  MAX_RADIUS_MM,
  MAX_RINGS,
  RING_SPACING_MM,
  SQUEEZE_GAS_RELEASE,
  TURN_CREDIT_FOR_FULL_ROUNDING,
  TURN_TAU,
  VENT_DURATION_SEC,
  VENT_THRESHOLD,
  VIGOR_FLOOR,
  VIGOR_FOULING_PENALTY,
  VIGOR_TAU,
  WATER_CHANGE_VIGOR_BONUS
} from './constants';
import { newShape, writeFacet, type Facet, type MarimoShape } from './facets';
import { SH_COUNT } from './sphericalHarmonics';
import type { CareInput, MarimoState } from './types';

/** Input for a marimo nobody is watching. */
export const IDLE_CARE_INPUT: CareInput = Object.freeze({ spin: 0 });

export function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** The exact relaxation fraction over `dt` for a first-order lag of `tau`. */
export function relaxFraction(dt: number, tau: number): number {
  return 1 - Math.exp(-dt / tau);
}

/**
 * The time-average of a relaxing quantity over the step it relaxes across.
 *
 *     (1/dt) * integral of [target + (from - target) e^(-t/tau)] dt
 *       = target - (target - from) * (1 - e^(-dt/tau)) * tau/dt
 *
 * Needed wherever one relaxing quantity *drives* another, since the driven term
 * cares about the whole step and not just where the driver ended up. Using the
 * end-of-step value instead would make the result depend on step size, which is
 * the one thing this file may not do — at catch-up step sizes a dent that formed
 * over the hour would be treated as having been there for all of it.
 */
export function relaxMean(from: number, target: number, dt: number, tau: number): number {
  if (!(dt > 0)) return from;
  return target - ((target - from) * relaxFraction(dt, tau) * tau) / dt;
}

/**
 * How well it is doing overall, 0..1. Scales growth and photosynthesis.
 * Floored, never zero — a neglected marimo slows down but never stops.
 */
export function healthOf(state: Pick<MarimoState, 'vigor' | 'fouling'>): number {
  return clamp(state.vigor * (1 - HEALTH_FOULING_PENALTY * state.fouling), HEALTH_FLOOR, 1);
}

export interface GasAdvanceResult {
  gas: number;
  vents: number;
}

/**
 * How much oxygen the alga is actually producing, 0..1, from its health.
 *
 * Not simply `health`: the curve is shifted so that a badly neglected marimo
 * settles below neutral buoyancy and stays on the gravel, which is what a sick
 * one does. A linear map would leave even a dying marimo bobbing at the
 * surface, which reads as thriving.
 */
export function photosynthesisRate(health: number): number {
  return clamp((health - 0.12) / 0.88, 0, 1);
}

/**
 * Advance trapped gas over `dt`, resolving any number of rise/vent/sink cycles
 * analytically.
 *
 *     dg/dt = health * (1 - g) / GAS_TAU - g / GAS_LEAK_TAU
 *           = a - b * g
 *
 * so g relaxes exponentially toward `a / b` with rate `b`. When it crosses
 * VENT_THRESHOLD the ball has surfaced and burps, dropping to GAS_AFTER_VENT.
 *
 * Solving for the crossing time rather than stepping preserves *cycle phase*,
 * so coming back after a week lands at a deterministic, plausible point in the
 * cycle instead of always the same one. It also means a badly neglected marimo
 * — whose equilibrium sits below the threshold — correctly stops surfacing.
 */
export function advanceGas(
  gas: number,
  health: number,
  dt: number,
  maxVents: number = CATCHUP_MAX_VENTS
): GasAdvanceResult {
  const a = photosynthesisRate(health) / GAS_TAU;
  const b = a + 1 / GAS_LEAK_TAU;
  const equilibrium = a / b;

  let g = clamp(gas, 0, 1);
  let remaining = dt;
  let vents = 0;

  while (remaining > 0 && vents < maxVents) {
    if (g >= VENT_THRESHOLD) {
      remaining -= Math.min(remaining, VENT_DURATION_SEC);
      g = GAS_AFTER_VENT;
      vents++;
      continue;
    }

    // Can it reach the threshold at all from here?
    if (equilibrium <= VENT_THRESHOLD) {
      g = equilibrium + (g - equilibrium) * Math.exp(-b * remaining);
      break;
    }

    const timeToVent = -Math.log((VENT_THRESHOLD - equilibrium) / (g - equilibrium)) / b;
    if (!Number.isFinite(timeToVent) || timeToVent >= remaining) {
      g = equilibrium + (g - equilibrium) * Math.exp(-b * remaining);
      break;
    }

    remaining -= timeToVent;
    g = VENT_THRESHOLD;
  }

  return { gas: clamp(g, 0, 1), vents };
}

/** Push any rings crossed between `prevRadius` and the current radius. */
function accreteRings(state: MarimoState, prevRadius: number): void {
  const before = Math.floor(prevRadius / RING_SPACING_MM);
  const after = Math.floor(state.radiusMm / RING_SPACING_MM);
  if (after <= before) return;

  // Only the most recent MAX_RINGS can survive the trim, so never build more.
  const first = Math.max(before + 1, after - MAX_RINGS + 1);
  for (let i = first; i <= after; i++) {
    state.rings.push({ r: i * RING_SPACING_MM, v: state.vigor });
  }
  if (state.rings.length > MAX_RINGS) {
    state.rings.splice(0, state.rings.length - MAX_RINGS);
  }
}

/**
 * Lay down this step's growth, unevenly, and fold the result into the permanent
 * shape.
 *
 * This is the one place a flat spot stops being temporary. New material is not
 * added evenly: the side resting on the gravel is shaded, pressed and scuffed,
 * so it gains `GROWTH_SHADOW * dent` less than the rest. Grow while dented and
 * the flat gets built into the ball as a facet; roll it and the fresh material
 * goes on evenly instead.
 *
 * Note it works in *absolute* terms (mm) and converts back at the end. That is
 * not a detail — it is what makes the term exactly composable, since absolute
 * deviation and mean radius each accumulate linearly, so any number of substeps
 * lands on the same place as one big one. It also gets the rounding-out for
 * free: a fixed flat is a smaller fraction of a bigger ball, so a well-turned
 * marimo grows out of its flats and its lumps without anything decaying them.
 */
function growShape(state: MarimoState, prevRadius: number, meanDent: number): void {
  const grown = state.radiusMm - prevRadius;
  if (!(grown > 0)) return;

  // Dilution: what was there keeps its absolute size and so shrinks as a
  // fraction. This is the only thing that ever undoes a permanent shape.
  const kept = prevRadius / state.radiusMm;
  const fresh = grown / state.radiusMm;
  for (let k = 0; k < SH_COUNT; k++) state.bias[k] *= kept;
  for (const facet of state.facets) facet.depth *= kept;

  const cut = Math.min(FACET_MAX_DEPTH, meanDent * GROWTH_SHADOW);
  const working = cut > 0 ? deepenContactFacet(state, cut * fresh) : null;

  // A facet outgrown to nothing is dropped rather than carried as a rounding
  // error for the rest of the marimo's life — but never the one currently being
  // worked on, which starts at a rounding error and has to be allowed to get
  // past this line before it is anything. A single step's growth is a ten
  // thousandth of a radius; the floor is four thousandths.
  if (state.facets.length > 0) {
    state.facets = state.facets.filter(
      (facet) => facet === working || facet.depth >= FACET_MIN_DEPTH
    );
  }
}

/**
 * Add `amount` of flatness where the ball is currently resting, and return the
 * face that took it.
 *
 * Deepens the facet already facing that way if there is one, since a marimo
 * that rocks a little in place is still working on the same face; the axis eases
 * round toward where the contact actually is, so a slow drift widens and turns
 * the existing flat instead of stamping a fan of near-identical ones. Only a
 * genuinely new side starts a new facet.
 */
function deepenContactFacet(state: MarimoState, amount: number): Facet | null {
  const [rx, ry, rz] = state.restDir;

  let match: Facet | null = null;
  let matchDot = FACET_MERGE_COS;
  let shallowest: Facet | null = null;
  for (const facet of state.facets) {
    const towards = facet.d[0] * rx + facet.d[1] * ry + facet.d[2] * rz;
    if (towards > matchDot) {
      matchDot = towards;
      match = facet;
    }
    if (!shallowest || facet.depth < shallowest.depth) shallowest = facet;
  }

  if (match) {
    match.depth = Math.min(FACET_MAX_DEPTH, match.depth + amount);
    // Track by the same fraction the new material represents, so this is as
    // step-size independent as the depth it goes with.
    const k = Math.min(1, (amount / Math.max(match.depth, 1e-6)) * FACET_AXIS_TRACK);
    const x = match.d[0] + (rx - match.d[0]) * k;
    const y = match.d[1] + (ry - match.d[1]) * k;
    const z = match.d[2] + (rz - match.d[2]) * k;
    const length = Math.hypot(x, y, z) || 1;
    match.d[0] = x / length;
    match.d[1] = y / length;
    match.d[2] = z / length;
    return match;
  }

  if (state.facets.length < MAX_FACETS) {
    const started: Facet = { d: [rx, ry, rz], depth: Math.min(FACET_MAX_DEPTH, amount) };
    state.facets.push(started);
    return started;
  }

  // Full. The shallowest face is the one this marimo has spent least time on,
  // so it is the one to give up — but only once the new contact has actually
  // outlasted it, or a ball rocking between four sides would keep resetting the
  // same slot and never flatten anywhere.
  if (shallowest && amount > shallowest.depth) {
    shallowest.d[0] = rx;
    shallowest.d[1] = ry;
    shallowest.d[2] = rz;
    shallowest.depth = Math.min(FACET_MAX_DEPTH, amount);
    return shallowest;
  }

  return null;
}

/**
 * The surface the marimo currently has: the smooth shape it has become, its
 * permanent flats, and the one it is holding right now.
 *
 * Derived rather than stored, so nothing can drift out of sync — `bias`,
 * `facets`, `dent` and `restDir` are the whole shape. Pass `out` to avoid
 * allocating; its facet pool has room for every permanent face plus the live
 * contact.
 */
export function shapeOf(
  state: Pick<MarimoState, 'dent' | 'restDir' | 'bias' | 'facets'>,
  out: MarimoShape = newShape(new Array<number>(SH_COUNT), MAX_FACETS + 1)
): MarimoShape {
  for (let k = 0; k < SH_COUNT; k++) out.coeffs[k] = state.bias[k];

  out.facetCount = 0;
  for (const facet of state.facets) {
    if (facet.depth > 0) writeFacet(out, out.facetCount, facet.d, facet.depth);
  }

  // The live contact goes on as its own cut rather than being merged into the
  // permanent one: they are the same face but not the same depth, and a plane
  // cut takes the deeper of the two anyway.
  if (state.dent > 0) writeFacet(out, out.facetCount, state.restDir, state.dent);

  return out;
}

/**
 * Advance the persisted state by `dt` seconds. Mutates in place.
 * Returns how many vent cycles happened, for the "while you were away" line.
 */
export function stepCare(state: MarimoState, dt: number, input: CareInput): number {
  if (!(dt > 0)) return 0;

  // The water goes stale.
  state.fouling += (1 - state.fouling) * relaxFraction(dt, FOUL_TAU);
  state.fouling = clamp(state.fouling, 0, 1);

  // Greenness chases the condition the water implies.
  const vigorTarget = clamp(1 - VIGOR_FOULING_PENALTY * state.fouling, VIGOR_FLOOR, 1);
  state.vigor += (vigorTarget - state.vigor) * relaxFraction(dt, VIGOR_TAU);
  state.vigor = clamp(state.vigor, VIGOR_FLOOR, 1);

  const health = healthOf(state);

  const gasResult = advanceGas(state.gas, health, dt);
  state.gas = gasResult.gas;

  // How much it has been turning lately.
  const spin = clamp(input.spin, 0, 1);
  state.turnCredit += (spin - state.turnCredit) * relaxFraction(dt, TURN_TAU);
  state.turnCredit = clamp(state.turnCredit, 0, 1);

  // Stillness deepens the flat spot; turning fills it back in, much faster.
  const stillness = clamp(1 - state.turnCredit / TURN_CREDIT_FOR_FULL_ROUNDING, 0, 1);
  const dentTarget = DENT_MAX * stillness;
  const dentTau = dentTarget > state.dent ? DENT_FORM_TAU : DENT_RECOVER_TAU;
  const dentBefore = state.dent;
  state.dent = clamp(
    dentBefore + (dentTarget - dentBefore) * relaxFraction(dt, dentTau),
    0,
    DENT_MAX
  );

  // Growth is shaped by the dent as it was *throughout* the step, not as it
  // happened to end up. At a catch-up step size those are very different things.
  const meanDent = relaxMean(dentBefore, dentTarget, dt, dentTau);

  // Growth. Monotone non-decreasing by construction, at every health level.
  const prevRadius = state.radiusMm;
  state.radiusMm = Math.min(MAX_RADIUS_MM, state.radiusMm + GROWTH_MM_PER_SEC * health * dt);
  accreteRings(state, prevRadius);
  growShape(state, prevRadius, meanDent);

  return gasResult.vents;
}

/** Fresh water: clears the murk and gives an immediate small lift. */
export function applyWaterChange(state: MarimoState, nowMs: number): void {
  state.fouling = 0;
  state.vigor = clamp(state.vigor + WATER_CHANGE_VIGOR_BONUS, VIGOR_FLOOR, 1);
  state.lastWaterChangeAt = nowMs;
}

/** A squeeze expels trapped gas, so it sinks. */
export function applySqueeze(state: MarimoState): void {
  state.gas = clamp(state.gas - SQUEEZE_GAS_RELEASE, 0, 1);
}
