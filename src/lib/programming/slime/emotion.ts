import { clamp } from './careSim';
import type { SlimeState } from './types';

/**
 * The emotion meter: the care state's slow wellbeing split into the two
 * axes everything expressive reads.
 *
 * - **Valence** (miserable 0 .. content 1) tracks the same blend `moodOf`
 *   reads — moisture, satiety, vigor — but relaxes toward it over seconds,
 *   and treats (a misting, a meal) lift it briefly above the baseline. A
 *   happy slime is glassy, saturated, wide-eyed, perky; a neglected one is
 *   cloudy, grey, droopy and still.
 * - **Arousal** (calm 0 .. agitated 1) is recent stimulation: pokes, being
 *   carried, sprays, food excitement, decaying back to a vigor-set idle
 *   hum. An aroused slime ripples, blinks snappily, stares, and roams.
 *
 * The meter is per-session and deliberately unpersisted: emotions are
 * weather, the care state is climate. Every term follows the care clock's
 * house rule (exact exponential relaxation), so frame rate cannot change
 * how moody the pet is.
 */

export interface Emotion {
  valence: number;
  arousal: number;
}

export interface EmotionMeter {
  /** Advance by `dt` seconds against the persisted care state. */
  update(dt: number, state: SlimeState): Emotion;
  /**
   * A stimulus: `agitation` bumps arousal, the optional `delight` lifts
   * valence above its care baseline for a while. Both fade on their own.
   */
  excite(agitation: number, delight?: number): void;
}

/** How fast valence chases its target, seconds. */
const VALENCE_TAU = 2.5;
/** How long a treat's lift lingers, seconds. */
const DELIGHT_TAU = 8;
/** How long stimulation takes to wear off, seconds. */
const STIMULUS_TAU = 6;

export function createEmotionMeter(): EmotionMeter {
  let valence = 0.5;
  let stimulus = 0;
  let delight = 0;
  const emotion: Emotion = { valence: 0.5, arousal: 0 };

  return {
    update(dt, state) {
      if (dt > 0) {
        delight *= Math.exp(-dt / DELIGHT_TAU);
        stimulus *= Math.exp(-dt / STIMULUS_TAU);
        // A crust feels nothing; waking feels very little. The relax (not a
        // snap) means a recrust dims the lights rather than cutting them.
        const base =
          state.stage === 'active'
            ? clamp(0.5 * state.moisture + 0.25 * state.satiety + 0.25 * state.vigor, 0.05, 1)
            : 0;
        const target = clamp(base + delight, 0, 1);
        valence += (target - valence) * (1 - Math.exp(-dt / VALENCE_TAU));
      }
      const idleHum = state.stage === 'active' ? 0.1 + 0.25 * state.vigor : 0;
      emotion.valence = valence;
      emotion.arousal = clamp(idleHum + stimulus, 0, 1);
      return emotion;
    },

    excite(agitation, delightBump = 0) {
      stimulus = Math.min(1.2, stimulus + Math.max(0, agitation));
      delight = Math.min(0.5, delight + Math.max(0, delightBump));
    }
  };
}
