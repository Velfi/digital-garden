/** The slime's life stages. Dormancy is the failure state, and it is reversible. */
export type SlimeStage = 'sclerotium' | 'waking' | 'active';

/**
 * Everything persisted about the pet. Motion state is deliberately absent —
 * the soft body re-settles from rest on every load, which the marimo
 * established as the honest thing to do.
 */
export interface SlimeState {
  v: number;
  seed: number;
  /**
   * The breed it was ordered as (see `breeds.ts`), or null for a pet from
   * before breeds existed — an unregistered pedigree, worn as whatever the
   * viewing settings say.
   */
  breed: import('./breeds').BreedId | null;
  bornAt: number;
  lastTickAt: number;
  stage: SlimeStage;
  /**
   * In `sclerotium`: soak progress toward waking, 0..1 — the time-integral of
   * moisture against the revival requirement. In `waking`: hatch progress,
   * 0..1. In `active`: unused, held at 0.
   */
  revival: number;
  /** How many times it has re-crusted. Later revivals need half the soak. */
  revivals: number;
  /** How long it has currently been critically dry, seconds. */
  drySec: number;
  moisture: number;
  satiety: number;
  vigor: number;
  radiusMm: number;
  /** Mica sheen earned by sprinkling flakes on it, 0 plain jelly .. 1 full pearl. */
  sparkle: number;
  lastMistAt: number;
  lastFedAt: number;
}

/** What `catchUpToNow` has to report beyond the new state. */
export interface CatchUpResult {
  elapsedSec: number;
  steps: number;
  /** Did the crust finish waking during this catch-up? */
  hatched: boolean;
  /** Did it dry out and re-crust during this catch-up? */
  recrusted: boolean;
  anomaly: 'none' | 'clock-backwards' | 'step-bounded';
}
