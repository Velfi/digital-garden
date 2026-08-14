import { moodOf, revivalRequirementSec } from './careSim';
import {
  DRY_THRESHOLD,
  FEED_DISABLED_ABOVE,
  MIST_MOISTURE,
  MOISTURE_TAU_DORMANT
} from './constants';
import type { CatchUpResult, SlimeState } from './types';

/**
 * State into prose: the panel shows numbers, these sentences say what they
 * mean. Each line leads with the state, then the need, then what to do.
 * The pet cannot be failed, only awaited.
 */

export function describeSlime(state: SlimeState): string {
  if (state.stage === 'sclerotium') {
    if (state.revival <= 0.02) {
      return state.revivals === 0
        ? 'Dormant — a dried crust on filter paper. That is how it ships. Mist it to start the wake-up soak.'
        : 'Dormant again — it has dried into a crust. This is safe and reversible. Mist it to start another soak.';
    }
    if (state.moisture < DRY_THRESHOLD) {
      return 'Soak stalled — the crust has dried out. Mist it again; soaking only counts while it is damp.';
    }
    if (state.revival < 0.45) return 'Soaking. The crust is darkening. Keep it damp.';
    if (state.revival < 0.85)
      return 'Soaking well — the crust has softened. Keep it damp and it will wake.';
    return 'Soak nearly done — the crust is soft and glistening. It will wake soon.';
  }

  if (state.stage === 'waking') {
    return 'Waking up.';
  }

  const mood = moodOf(state);
  if (state.moisture < DRY_THRESHOLD)
    return 'Parched — matte and slow. It needs misting now.';
  if (state.moisture < 0.25) return 'Getting dry. Mist it soon.';
  if (state.satiety < 0.1) return 'Hungry. Drop it an oat flake.';
  if (mood > 0.75) return 'Content — glossy and plump. It needs nothing right now.';
  if (mood > 0.45) return 'Doing fine. No urgent needs.';
  return 'Listless — low on moisture or food. Mist it and feed it.';
}

function days(sec: number): number {
  return Math.floor(sec / 86400);
}

/** The "while you were away" line, or null when nothing is worth saying. */
export function describeAbsence(result: CatchUpResult, state: SlimeState): string | null {
  const away = result.elapsedSec;
  if (away < 6 * 3600) return null;

  const daysAway = days(away);
  const spell =
    daysAway >= 2
      ? `${daysAway} days`
      : daysAway === 1
        ? 'a day'
        : `${Math.round(away / 3600)} hours`;

  if (result.hatched) {
    return `While you were away (${spell}), it finished waking up.`;
  }
  if (result.recrusted) {
    return `While you were away (${spell}), it dried out and went dormant. It is not gone — mist it to start a new soak.`;
  }
  if (state.stage === 'sclerotium') {
    // A soak that finished offscreen holds at the brink (see stepCare's
    // `witnessed` gate) — by the time this line is read, the hatch is
    // already starting in front of them.
    if (state.revival >= 1) {
      return `While you were away (${spell}), the soak finished. It is waking up now.`;
    }
    if (state.revival > 0.02) {
      return `While you were away (${spell}), the soak continued — now ${Math.round(
        state.revival * 100
      )}% of the way to waking.`;
    }
    return `Still dormant after ${spell}. Dormancy does not harm it.`;
  }
  if (state.moisture < DRY_THRESHOLD) {
    return `While you were away (${spell}), it dried out. It needs misting.`;
  }
  if (state.satiety < 0.1) {
    return `While you were away (${spell}), it ate everything. It is hungry again.`;
  }
  return `You were away ${spell}. It is fine.`;
}

/** How far through the current soak it is, 0..1, for the revival meter. */
export function revivalProgress(state: SlimeState): number {
  return state.stage === 'sclerotium' ? state.revival : 1;
}

/** Rough sprays remaining, for the panel's hint under the meter. */
export function spraysRemaining(state: SlimeState): number {
  if (state.stage !== 'sclerotium') return 0;
  // One spray soaks roughly MIST_MOISTURE × dormant-tau of moisture-seconds.
  const soakPerMist = MIST_MOISTURE * MOISTURE_TAU_DORMANT;
  const needed = (1 - state.revival) * revivalRequirementSec(state.revivals);
  return Math.max(1, Math.ceil(needed / soakPerMist));
}

/** Whether the feed button should read as disabled-with-a-reason. */
export function fullnessNote(state: SlimeState): string | null {
  return state.satiety >= FEED_DISABLED_ABOVE ? 'Full — it will not eat more right now.' : null;
}
