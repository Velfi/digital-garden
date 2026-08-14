import {
  GRIME_AWAY_CLIMB_INTERVAL_SEC,
  GRIME_AWAY_MAX_CLIMBS,
  GRIME_AWAY_MAX_ELAPSED_SEC,
  GRIME_AWAY_SLIDE,
  GRIME_AWAY_SPLAT_DT,
  GRIME_AWAY_TAU_SEC,
  GRIME_HEIGHT,
  GRIME_WIDTH
} from './constants';
import { mulberry32 } from '../marimo/rng';
import { PANE_COUNT, type GrimeField } from './grimeMap';
import type { SlimeStage } from './types';

/**
 * What the panes do between visits.
 *
 * Two halves, both pure so the tests need neither GPU nor storage. The
 * *blob* is the four pane fields quantised to the same bytes the textures
 * already upload, base64'd into one string — `persist.ts` owns the actual
 * localStorage traffic, as ever. The *absence* is simulated on load: dried
 * film decays on a days-long tau (the live twenty-minute tau is a wet smear
 * settling; a closed tab means the smear dried where it was), and an active
 * slime keeps climbing while nobody watches, so the walls come back a little
 * worse than they were left. Seeded, so a reload mid-absence does not mint
 * a different past.
 */

export const GRIME_BLOB_VERSION = 1;

export function serializeGrime(field: GrimeField): string {
  const panes = field.data.map((data) => {
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      bytes[i] = Math.min(255, Math.round(data[i] * 255));
    }
    // fromCharCode in slabs: one call per texel blows the argument limit.
    let bin = '';
    for (let i = 0; i < bytes.length; i += 4096) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 4096));
    }
    return btoa(bin);
  });
  return JSON.stringify({ v: GRIME_BLOB_VERSION, w: GRIME_WIDTH, h: GRIME_HEIGHT, panes });
}

/**
 * Fill `field` from a stored blob. False (and an untouched field) on any
 * mismatch — wrong version, wrong resolution, wrong pane count, corrupt
 * base64. Bytes decode straight into 0..1, so no range check is needed.
 */
export function deserializeGrime(raw: string, field: GrimeField): boolean {
  try {
    const parsed = JSON.parse(raw) as {
      v?: unknown;
      w?: unknown;
      h?: unknown;
      panes?: unknown;
    };
    if (parsed?.v !== GRIME_BLOB_VERSION) return false;
    if (parsed.w !== GRIME_WIDTH || parsed.h !== GRIME_HEIGHT) return false;
    if (!Array.isArray(parsed.panes) || parsed.panes.length !== PANE_COUNT) return false;
    const decoded: string[] = [];
    for (const b64 of parsed.panes) {
      if (typeof b64 !== 'string') return false;
      const bin = atob(b64);
      if (bin.length !== GRIME_WIDTH * GRIME_HEIGHT) return false;
      decoded.push(bin);
    }
    for (let pane = 0; pane < PANE_COUNT; pane++) {
      const bin = decoded[pane];
      const data = field.data[pane];
      for (let i = 0; i < data.length; i++) {
        data[i] = bin.charCodeAt(i) / 255;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * How busily the pet gums glass while unwatched, 0..1. A crust and a waking
 * blob stay put; an active slime climbs in proportion to its vigor.
 */
export function awayActivity(stage: SlimeStage, vigor: number): number {
  if (stage !== 'active') return 0;
  return 0.35 + 0.65 * Math.min(1, Math.max(0, vigor));
}

/** One unwatched climb: a wobbling streak up a pane from the floor. */
function layClimb(field: GrimeField, rng: () => number): void {
  const pane = Math.floor(rng() * PANE_COUNT) % PANE_COUNT;
  const top = 0.25 + 0.55 * rng();
  let u = 0.15 + 0.7 * rng();
  const samples = 14;
  for (let s = 0; s <= samples; s++) {
    const v = (s / samples) * top;
    u += (rng() - 0.5) * 0.04;
    field.splat(
      pane,
      Math.min(1, Math.max(0, u)),
      v,
      GRIME_AWAY_SPLAT_DT,
      GRIME_AWAY_SLIDE
    );
  }
}

/**
 * Age the field through an absence: dried-film decay interleaved with the
 * climbs the pet made while nobody watched, oldest first, so an early climb
 * comes back fainter than a fresh one. Deterministic in `seed`.
 */
export function simulateGrimeAway(
  field: GrimeField,
  elapsedSec: number,
  activity: number,
  seed: number
): void {
  const elapsed = Math.min(elapsedSec, GRIME_AWAY_MAX_ELAPSED_SEC);
  if (!(elapsed > 0)) return;
  const rng = mulberry32(seed);
  // rng() rounds the fractional climb stochastically-but-stably: a 30-minute
  // absence sometimes gummed and sometimes did not, and reloading again does
  // not change which.
  const climbs = Math.min(
    GRIME_AWAY_MAX_CLIMBS,
    Math.floor((elapsed / GRIME_AWAY_CLIMB_INTERVAL_SEC) * activity + rng())
  );
  const gaps = climbs + 1;
  for (let i = 0; i < gaps; i++) {
    field.decay(elapsed / gaps, GRIME_AWAY_TAU_SEC);
    if (i < climbs) layClimb(field, rng);
  }
}
