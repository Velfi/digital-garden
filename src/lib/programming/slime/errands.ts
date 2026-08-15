import { BOX_HALF_X, BOX_HALF_Z } from './constants';
import { mulberry32 } from '../marimo/rng';
import type { Emotion } from './emotion';

/**
 * The errand arbiter: the will's appointment book.
 *
 * The scene used to run five independent bout-then-rest schedulers (amble,
 * popcorn, ball play, springtail chase, perch) whose errands simply lapsed
 * when anything interrupted them. This module owns those same clocks and
 * gates — identical thresholds and cadences — but holds them as a single
 * *current errand with memory*: an errand preempted by the hand or a meal
 * is suspended, not discarded, and if the interruption ends within the
 * pet's patience it goes back to the very same spot, rock, or quarry —
 * after a brief glance at it, so the intention reads on the outside.
 *
 * Every scheduler rolls its next appointment once, at bout start, anchored
 * to the bout's end (`next = now + bout + rest`), exactly as the scene's
 * old clocks did — so cancellations and expiries never re-roll, and the
 * cadence of the pet's days is unchanged by the refactor.
 *
 * Pure and seeded in the climb-planner idiom: no scene imports, no THREE,
 * every draw from one `mulberry32` stream, so the mind is testable without
 * a body. The scene stays the senses and the hands — it answers quarry
 * picks, reports perch arrival, and turns errands into lures.
 */

export type ErrandKind = 'amble' | 'play' | 'chase' | 'perch';

export interface ErrandInputs {
  /** Frame seconds. */
  dt: number;
  mood: Emotion;
  /** !handBusy && stage === 'active' — false suspends the current errand. */
  willFree: boolean;
  /** A meal is on offer (the food lure preempts everything, scene-side). */
  foodClaimed: boolean;
  /** Actually engulfing — holds the popcorn's feet still, same as before. */
  eating: boolean;
  ballOut: boolean;
  /** True the frame the ball is tossed in: a beat of regard, then play. */
  ballJustTossed: boolean;
  rockCount: number;
  moisture: number;
  /** Hungry — a hungry slime never *plays* chase; that would be hunting. */
  canFeed: boolean;
  reducedMotion: boolean;
  /** The scene's answer to last frame's `wantQuarryPick` (-1 = nobody). */
  quarryPick: number;
  /** The chased critter vanished this frame (eaten by the hunger flip). */
  quarryLost: boolean;
  /** The body is up on the perch rock (dist < radius * 0.7), scene-tested. */
  perchArrived: boolean;
  /** Extends a live chase at least this far (the player-poked ptooey). */
  chaseBoostSec: number;
}

export interface ErrandState {
  kind: ErrandKind;
  /** Amble only: the chosen floor spot. */
  ambleTarget: readonly [number, number] | null;
  /** Perch only: which of the tank's rocks. */
  rockIndex: number;
  /** Chase only: which critter (may be re-picked mid-bout). */
  quarryIndex: number;
  /** Perch arrived: the scene softens the lure to a hold. */
  holdSoft: boolean;
}

export interface ErrandOutputs {
  errand: ErrandState | null;
  /**
   * Set during the short re-orientation after a resume: the eyes go back
   * to the old target before the body does — attention only, no lure yet.
   */
  resumeGlance: ErrandState | null;
  /** The scene should answer with `springtails.nearestLive` next frame. */
  wantQuarryPick: boolean;
  /** A popcorn hop this frame, or null. Never emitted under reduced motion. */
  hop: { impulse: number; dx: number; dz: number } | null;
}

export interface ErrandArbiter {
  update(inputs: ErrandInputs): ErrandOutputs;
  /** Test/debug window: the current and the remembered errand. */
  peek(): { current: ErrandState | null; suspended: ErrandState | null };
}

/** How long the resumed errand is looked at before it is walked to. */
export const RESUME_GLANCE_SEC = 0.7;
/** How long a suspended errand is kept: a content slime waits longer. */
export function patienceSec(valence: number): number {
  return 10 + 40 * valence;
}

interface Bout extends ErrandState {
  /** Seconds of bout left — a duration, so suspension freezes it. */
  remainingSec: number;
}

/** The old ladder's pecking order; a firing outranks a live lesser errand. */
const KIND_PRIORITY: Record<ErrandKind, number> = { play: 3, chase: 2, perch: 1, amble: 0 };

export function createErrandArbiter(seed: number): ErrandArbiter {
  const rand = mulberry32(seed >>> 0);

  // The clocks, verbatim from the scene's old schedulers (including the
  // draw order of their opening lotteries — one RNG stream, same story).
  let t = 0;
  let nextAmbleAt = 20 + rand() * 20;
  let nextPopcornAt = 15 + rand() * 15;
  let nextChaseAt = 30 + rand() * 30;
  let nextPerchAt = 45 + rand() * 45;
  let nextPlayAt = 0;

  let popcornHopsLeft = 0;
  let nextPopHopAt = 0;

  let current: Bout | null = null;
  let suspended: Bout | null = null;
  let suspendedPatience = 0;
  let glanceSec = 0;
  /** A fresh chase is waiting on the scene's quarry pick. */
  let pendingChase = false;
  let wantPick = false;

  const outputs: ErrandOutputs = {
    errand: null,
    resumeGlance: null,
    wantQuarryPick: false,
    hop: null
  };

  function askPick(): void {
    outputs.wantQuarryPick = true;
    wantPick = true;
  }

  /**
   * A wish that outlived its patience rests a beat before that kind is
   * scheduled again — the clocks kept running during the interruption, so
   * without this a long hold would end in an instant, unrelated errand of
   * the same kind, which reads as "it forgot" and "it never cared" at once.
   * The delays are each kind's gate-fail retry, so cadence stays familiar.
   */
  function restAfterExpiry(kind: ErrandKind): void {
    if (kind === 'amble') nextAmbleAt = Math.max(nextAmbleAt, t + 10);
    else if (kind === 'play') nextPlayAt = Math.max(nextPlayAt, t + 8);
    else if (kind === 'chase') nextChaseAt = Math.max(nextChaseAt, t + 10);
    else nextPerchAt = Math.max(nextPerchAt, t + 15);
  }

  return {
    update(inputs) {
      const { dt, mood } = inputs;
      t += dt;
      outputs.errand = null;
      outputs.resumeGlance = null;
      outputs.wantQuarryPick = false;
      outputs.hop = null;
      const pace = 0.4 + mood.arousal;

      // ----------------------------------------------------------- answers
      if (wantPick) {
        wantPick = false;
        if (pendingChase) {
          pendingChase = false;
          if (inputs.quarryPick >= 0) {
            const bout = 5 + rand() * 7;
            nextChaseAt = t + bout + (25 + rand() * 50) / pace;
            current = {
              kind: 'chase',
              ambleTarget: null,
              rockIndex: -1,
              quarryIndex: inputs.quarryPick,
              holdSoft: false,
              remainingSec: bout
            };
          } else {
            nextChaseAt = t + 15;
          }
        } else if (current?.kind === 'chase') {
          // A mid-bout or post-resume re-pick.
          if (inputs.quarryPick >= 0) current.quarryIndex = inputs.quarryPick;
          else current = null; // the bout lapses; its next-time was set at start
        }
      }

      // -------------------------------------------------------- suspension
      const preempted = !inputs.willFree || inputs.foodClaimed;
      if (preempted) {
        if (current) {
          // The hand or a meal took over: shelve the errand, keep wanting it.
          suspended = current;
          suspendedPatience = patienceSec(mood.valence);
          current = null;
          glanceSec = 0;
        }
        if (suspended) {
          suspendedPatience -= dt;
          // Patience running out mid-interruption: the wish quietly expires.
          if (suspendedPatience <= 0) {
            restAfterExpiry(suspended.kind);
            suspended = null;
          }
        }
        pendingChase = false;
        popcornHopsLeft = 0;
        return outputs;
      }

      if (suspended) {
        suspendedPatience -= dt;
        if (suspendedPatience <= 0) {
          restAfterExpiry(suspended.kind);
          suspended = null;
        } else if (glanceSec === 0) {
          // Freed within patience: first a look back at the old errand...
          glanceSec = RESUME_GLANCE_SEC;
        }
      }
      if (suspended && glanceSec > 0) {
        glanceSec -= dt;
        if (glanceSec > 0) {
          outputs.resumeGlance = suspended;
          return outputs;
        }
        // ...then the errand itself, same target, frozen clock resumed.
        current = suspended;
        suspended = null;
        glanceSec = 0;
        // The remembered quarry may be gone — ask before giving chase.
        if (current.kind === 'chase') askPick();
      }

      // -------------------------------------------------------- the errand
      if (current) {
        current.remainingSec -= dt;
        if (current.remainingSec <= 0) current = null;
      }
      if (current?.kind === 'chase') {
        if (inputs.chaseBoostSec > 0)
          current.remainingSec = Math.max(current.remainingSec, inputs.chaseBoostSec);
        // The hunger flip ate the playmate: pick whoever is nearest, or
        // let the bout lapse (the scene answers next frame).
        if (inputs.quarryLost && !wantPick) askPick();
      }
      if (current?.kind === 'play' && !inputs.ballOut) current = null;
      if (current?.kind === 'perch') current.holdSoft = inputs.perchArrived;
      if (inputs.ballJustTossed) {
        // A beat of regard before the first pounce, as the toss always had.
        nextPlayAt = Math.max(nextPlayAt, t + 1.5);
        if (current?.kind === 'play') current = null;
      }

      // ----------------------------------------------------- the schedulers
      // Each fires on its own clock with the old gates; a firing replaces a
      // live errand of lower priority (the old ladder's cancel, not a
      // suspension — only the hand and a meal earn being waited for).
      const rank = current ? KIND_PRIORITY[current.kind] : -1;

      // Play: with the ball out, a content-enough slime takes it in bouts.
      if (!pendingChase && inputs.ballOut && rank < KIND_PRIORITY.play && t >= nextPlayAt) {
        if (mood.valence > 0.2 && mood.arousal > 0.1) {
          const bout = 6 + rand() * 8;
          nextPlayAt = t + bout + (8 + rand() * 17) / pace;
          current = {
            kind: 'play',
            ambleTarget: null,
            rockIndex: -1,
            quarryIndex: -1,
            holdSoft: false,
            remainingSec: bout
          };
        } else {
          nextPlayAt = t + 8;
        }
      }

      // Chase: no toy, nothing to eat, a bright mood on a full belly. The
      // bout starts only once the scene answers with an actual critter.
      if (
        !pendingChase &&
        !inputs.ballOut &&
        (!current || KIND_PRIORITY[current.kind] < KIND_PRIORITY.chase) &&
        t >= nextChaseAt
      ) {
        if (mood.valence > 0.25 && mood.arousal > 0.2 && !inputs.canFeed) {
          pendingChase = true;
          askPick();
        } else {
          nextChaseAt = t + 10;
        }
      }

      // Perch: damp enough to grip, content enough to wander up.
      if (
        !pendingChase &&
        (!current || KIND_PRIORITY[current.kind] < KIND_PRIORITY.perch) &&
        inputs.rockCount > 0 &&
        t >= nextPerchAt
      ) {
        if (inputs.moisture >= 0.35 && mood.valence > 0.2 && mood.arousal > 0.1) {
          const bout = 12 + rand() * 15;
          nextPerchAt = t + bout + (40 + rand() * 80) / pace;
          current = {
            kind: 'perch',
            ambleTarget: null,
            rockIndex: Math.floor(rand() * inputs.rockCount),
            quarryIndex: -1,
            holdSoft: false,
            remainingSec: bout
          };
        } else {
          nextPerchAt = t + 15;
        }
      }

      // Amble: only from true idleness — every other errand outranks it.
      if (!pendingChase && !current && t >= nextAmbleAt) {
        if (mood.valence > 0.3 && mood.arousal > 0.2) {
          const reach = 0.75;
          const target: [number, number] = [
            (rand() * 2 - 1) * BOX_HALF_X * reach,
            (rand() * 2 - 1) * BOX_HALF_Z * reach
          ];
          const bout = 4 + rand() * 5;
          nextAmbleAt = t + bout + (12 + rand() * 30) / pace;
          current = {
            kind: 'amble',
            ambleTarget: target,
            rockIndex: -1,
            quarryIndex: -1,
            holdSoft: false,
            remainingSec: bout
          };
        } else {
          nextAmbleAt = t + 10;
        }
      }

      // Popcorn: layered on whatever else is afoot, never under reduced
      // motion, never mid-meal. Bursts fire only out of real excitement.
      if (!inputs.reducedMotion && !inputs.eating) {
        if (popcornHopsLeft > 0 && t >= nextPopHopAt) {
          popcornHopsLeft -= 1;
          const ang = rand() * Math.PI * 2;
          const drift = 0.03 * rand();
          outputs.hop = {
            impulse: 0.5 + 0.2 * mood.arousal,
            dx: Math.cos(ang) * drift,
            dz: Math.sin(ang) * drift
          };
          nextPopHopAt = t + 0.35 + rand() * 0.3;
        }
        if (popcornHopsLeft === 0 && t >= nextPopcornAt) {
          if (mood.arousal > 0.55 && mood.valence > 0.45) {
            popcornHopsLeft = 2 + Math.floor(rand() * 3);
            nextPopHopAt = t;
            nextPopcornAt = t + 18 + rand() * 40;
          } else {
            nextPopcornAt = t + 5;
          }
        }
      } else {
        popcornHopsLeft = 0;
      }

      outputs.errand = current;
      return outputs;
    },

    peek() {
      return { current, suspended };
    }
  };
}
