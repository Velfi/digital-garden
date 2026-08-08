/**
 * The care panel says how the marimo is doing in words, not numbers.
 *
 * Condition is already legible in the render — browning, the flat spot, the
 * murk — so this is a caption for what you can see, not a stats readout. One to
 * three clauses, ordered by what most wants attention.
 */

import type { MarimoState } from './types';

const MAX_CLAUSES = 3;

/** How flat the resting side has gone, as a fraction of mean radius. */
export function restingFlatness(state: MarimoState): number {
  return Math.max(0, state.dent);
}

/**
 * The deepest flat it has actually grown into, as a fraction of mean radius.
 *
 * Kept apart from `restingFlatness` because they are different news. One is
 * "it has been sitting still lately" and can be undone this afternoon; the
 * other is "it grew this way" and takes months of getting bigger to outgrow.
 */
export function bakedFlatness(state: MarimoState): number {
  let deepest = 0;
  for (const facet of state.facets) deepest = Math.max(deepest, facet.depth);
  return deepest;
}

export function describeCondition(state: MarimoState): string[] {
  const clauses: string[] = [];
  const flatness = restingFlatness(state);

  // The water first — it is the thing you can actually fix in one click.
  if (state.fouling > 0.65) {
    clauses.push('The water has gone cloudy.');
  } else if (state.fouling > 0.3) {
    clauses.push('The water is starting to cloud over.');
  }

  // Then colour.
  if (state.vigor < 0.3) {
    clauses.push('It has gone brown and dull.');
  } else if (state.vigor < 0.55) {
    clauses.push('It is looking pale.');
  } else if (state.vigor > 0.88 && clauses.length === 0) {
    clauses.push('Deep green all over.');
  }

  // Then shape. The grown-in flats come first: they are the older news, and
  // saying "starting to flatten" about a ball with two flat sides already would
  // be comic.
  const baked = bakedFlatness(state);
  if (baked > 0.09) {
    clauses.push(
      state.facets.length > 1
        ? 'Grown into a flat-sided cushion.'
        : 'It has grown flat on one side.'
    );
  } else if (baked > 0.03) {
    clauses.push('One side has settled a little flat.');
  } else if (flatness > 0.075) {
    clauses.push('A pale flat side where it has been resting.');
  } else if (flatness > 0.035) {
    clauses.push('Just starting to flatten where it sits.');
  }

  // Then whatever it happens to be doing, if there is room.
  if (clauses.length < MAX_CLAUSES) {
    if (state.turnCredit > 0.5) {
      clauses.push('Turning steadily.');
    } else if (state.gas > 0.7) {
      clauses.push('Buoyant, drifting toward the surface.');
    } else if (state.turnCredit < 0.05 && flatness <= 0.035) {
      clauses.push('Sitting quite still on the gravel.');
    }
  }

  if (clauses.length === 0) {
    clauses.push('Round, green, and quietly getting on with it.');
  }

  return clauses.slice(0, MAX_CLAUSES);
}

/** The one-line summary under the cross-section. */
export function describeSize(state: MarimoState): string {
  return `${(state.radiusMm * 2).toFixed(1)} mm across`;
}

/** How long it has been going, in words. */
export function describeAge(bornAt: number, nowMs: number): string {
  const days = Math.max(0, (nowMs - bornAt) / 86_400_000);
  if (days < 1) return 'hatched today';
  if (days < 2) return 'a day old';
  if (days < 60) return `${Math.floor(days)} days old`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} months old`;
  const years = Math.floor(months / 12);
  return years === 1 ? 'a year old' : `${years} years old`;
}

/**
 * Size and age together, for naming what a restart would throw away.
 *
 * Worth the sentence: a marimo is the one thing on this page that cannot be got
 * back, and how much there is to lose is exactly how long you have had it.
 */
export function describePet(state: MarimoState, nowMs: number): string {
  return `${describeSize(state)}, ${describeAge(state.bornAt, nowMs)}`;
}

/** The transient "while you were away" line, or null if nothing worth saying. */
export function describeAbsence(elapsedSec: number, ventCount: number): string | null {
  if (elapsedSec < 6 * 3600) return null;
  if (ventCount < 2) return null;
  const days = elapsedSec / 86400;
  const when =
    days >= 1.5 ? `over ${Math.round(days)} days` : `in the ${Math.round(elapsedSec / 3600)} hours`;
  return `While you were away, ${when} since your last visit, it surfaced ${ventCount} times.`;
}
