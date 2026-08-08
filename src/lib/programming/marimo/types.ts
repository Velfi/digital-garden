import type { Facet } from './facets';

/** One growth ring: the mean radius when it formed, and how green it was then. */
export interface RingRecord {
  /** Mean radius in mm at the moment this ring closed. */
  r: number;
  /** Vigor 0..1 when it formed — drives the ring colour in the cross-section. */
  v: number;
}

/**
 * Everything persisted about the pet. Advanced by the care clock only.
 *
 * Deliberately excluded: position, velocity, orientation, angular velocity,
 * water swirl, particles. Those belong to the motion clock and are re-derived
 * on load — the ball starts at the surface if it is buoyant, on the floor
 * otherwise, which reads as "it moved while you were gone".
 */
export interface MarimoState {
  /** Schema version. See `migrate()` in persist.ts. */
  v: number;
  /** uint32 seed — drives strand jitter, gravel layout, initial lumpiness. */
  seed: number;
  /** Epoch ms when this marimo was created. */
  bornAt: number;
  /** Epoch ms of the last care tick. The anchor for offline catch-up. */
  lastTickAt: number;

  /** Mean radius in mm. Monotone non-decreasing, always. */
  radiusMm: number;
  /**
   * Depth of the resting flat spot, 0..DENT_MAX, as a fraction of mean radius.
   *
   * Transient: turning fills it back in. Rendered as a plane cut along
   * `restDir` rather than as a bulge in `bias` — see `facets.ts`. The *visible*
   * shape is this, `bias` and `facets` together, derived by `shapeOf()` rather
   * than stored, so nothing can disagree with anything else.
   */
  dent: number;
  /**
   * Permanent smooth shape, as 16 SH coefficients relative to mean radius.
   *
   * The lumpiness the ball was born with and has not yet grown out of. Rolling
   * cannot undo it; only growing can, and only by dilution, since a fixed
   * absolute bump is a smaller fraction of a bigger ball.
   */
  bias: number[];
  /**
   * Permanent flat faces, at most MAX_FACETS of them.
   *
   * Where `dent` is the flat the ball is holding right now, these are the ones
   * it has grown into: every contact that was still there while new material
   * was being laid down. Same dilution rule as `bias` — a fixed flat is a
   * smaller fraction of a bigger ball — and nothing else erodes them, so a
   * marimo that spent a year on one side is flat-bottomed for a long while
   * after you start turning it.
   */
  facets: Facet[];
  /** Greenness, 0..1. Never falls below VIGOR_FLOOR. */
  vigor: number;
  /** Trapped photosynthetic oxygen, 0..1. Drives buoyancy. */
  gas: number;
  /** Growth rings, oldest first, capped at MAX_RINGS. */
  rings: RingRecord[];

  /** Body-frame unit vector pointing at the current resting contact. */
  restDir: [number, number, number];
  /** Rolling average of how much it has been turning, 0..1. */
  turnCredit: number;

  /** Water cloudiness, 0..1. */
  fouling: number;
  /** Epoch ms of the last water change. */
  lastWaterChangeAt: number;
}

/** What the motion clock tells the care clock each tick. */
export interface CareInput {
  /** Normalised angular speed, 0..1. Zero while the page is closed. */
  spin: number;
}

/** Live physical state of the ball. Never persisted. */
export interface BodyState {
  position: [number, number, number];
  velocity: [number, number, number];
  /** Orientation quaternion, xyzw. */
  quaternion: [number, number, number, number];
  /** Angular velocity in world space, rad/s. */
  omega: [number, number, number];
  grounded: boolean;
  /** Seconds remaining in the current vent, or 0. */
  venting: number;
}

/** Bulk water motion. Decays to stillness a few seconds after you stop stirring. */
export interface SwirlState {
  /** Rotation about the tank's vertical axis, rad/s. */
  omegaY: number;
  /** Strength of the overturning cell, m/s. Positive rises up the middle. */
  vy: number;
}

export interface CatchUpResult {
  elapsedSec: number;
  steps: number;
  /** How many times it rose, vented and sank while you were away. */
  ventCount: number;
  anomaly: 'none' | 'clock-backwards' | 'step-bounded';
}
