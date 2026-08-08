/**
 * The only module that touches localStorage.
 *
 * Load path is migrate-then-validate-then-fall-back, following the precedent in
 * `src/routes/badger/store/index.ts`. Anything unrecognised or corrupt hatches a
 * fresh marimo rather than throwing — and if storage is unavailable entirely
 * (Safari private browsing) the pet degrades to ephemeral instead of taking the
 * page down.
 */

import { browser } from '$app/environment';
import {
  BIAS_MAX,
  DENT_MAX,
  FACET_MAX_DEPTH,
  INITIAL_RADIUS_MM,
  MAX_FACETS,
  MAX_RADIUS_MM,
  MAX_RINGS
} from './constants';
import type { Facet } from './facets';
import { randomSeed } from './rng';
import { DENT_UNIT_NORM, SH_COUNT, shapeMagnitude, zeroShape } from './sphericalHarmonics';
import type { MarimoState, RingRecord } from './types';

export const MARIMO_STATE_VERSION = 3;
export const MARIMO_STORAGE_KEY = 'marimo-tank-v1';

/** Fields that must survive serialisation exactly — epoch ms and integers. */
const EXACT_KEYS = new Set(['v', 'seed', 'bornAt', 'lastTickAt', 'lastWaterChangeAt']);

/**
 * Bias norm a stored marimo may claim. Slack over the live cap because
 * serialisation rounds to six significant figures, which can nudge a marimo
 * sitting exactly on the cap a hair over it.
 */
const BIAS_NORM_LIMIT = BIAS_MAX * DENT_UNIT_NORM * 1.02;

export function newMarimo(nowMs: number, seed: number = randomSeed()): MarimoState {
  return {
    v: MARIMO_STATE_VERSION,
    seed,
    bornAt: nowMs,
    lastTickAt: nowMs,
    radiusMm: INITIAL_RADIUS_MM,
    dent: 0,
    bias: zeroShape(),
    facets: [],
    vigor: 1,
    gas: 0.1,
    rings: [],
    restDir: [0, -1, 0],
    turnCredit: 0,
    fouling: 0,
    lastWaterChangeAt: nowMs
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inRange(value: unknown, lo: number, hi: number): value is number {
  return isFiniteNumber(value) && value >= lo && value <= hi;
}

/**
 * Structural + range validation. Returns null on anything suspect; the caller
 * hatches a fresh marimo rather than trying to repair.
 */
export function validateMarimoState(raw: unknown): MarimoState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;

  if (s.v !== MARIMO_STATE_VERSION) return null;
  if (!isFiniteNumber(s.seed)) return null;
  if (!isFiniteNumber(s.bornAt) || !isFiniteNumber(s.lastTickAt)) return null;
  if (!isFiniteNumber(s.lastWaterChangeAt)) return null;

  if (!inRange(s.radiusMm, 0.1, MAX_RADIUS_MM)) return null;
  if (!inRange(s.vigor, 0, 1)) return null;
  if (!inRange(s.gas, 0, 1)) return null;
  if (!inRange(s.fouling, 0, 1)) return null;
  if (!inRange(s.turnCredit, 0, 1)) return null;
  if (!inRange(s.dent, 0, DENT_MAX)) return null;

  if (!Array.isArray(s.bias) || s.bias.length !== SH_COUNT) return null;
  const bias: number[] = [];
  for (const c of s.bias as unknown[]) {
    if (!isFiniteNumber(c)) return null;
    bias.push(c);
  }
  // A hand-edited bias could otherwise turn the ball inside out.
  if (shapeMagnitude(bias) > BIAS_NORM_LIMIT) return null;

  if (!Array.isArray(s.facets) || s.facets.length > MAX_FACETS) return null;
  const facets: Facet[] = [];
  for (const entry of s.facets as unknown[]) {
    if (!entry || typeof entry !== 'object') return null;
    const facet = entry as Record<string, unknown>;
    if (!inRange(facet.depth, 0, FACET_MAX_DEPTH * 1.02)) return null;
    const axis = facet.d;
    if (!Array.isArray(axis) || axis.length !== 3) return null;
    for (const c of axis as unknown[]) {
      if (!inRange(c, -1.001, 1.001)) return null;
    }
    // A zero or near-zero axis has no direction to cut along, and normalising
    // one would be inventing a face nobody stored.
    const length = Math.hypot(axis[0] as number, axis[1] as number, axis[2] as number);
    if (!(length > 0.5)) return null;
    facets.push({
      d: [(axis[0] as number) / length, (axis[1] as number) / length, (axis[2] as number) / length],
      depth: Math.min(facet.depth, FACET_MAX_DEPTH)
    });
  }

  if (!Array.isArray(s.restDir) || s.restDir.length !== 3) return null;
  const restDir = s.restDir as unknown[];
  for (const c of restDir) {
    if (!inRange(c, -1.001, 1.001)) return null;
  }
  const restLen = Math.hypot(restDir[0] as number, restDir[1] as number, restDir[2] as number);
  if (!(restLen > 0.5)) return null;

  if (!Array.isArray(s.rings) || s.rings.length > MAX_RINGS) return null;
  const rings: RingRecord[] = [];
  for (const entry of s.rings as unknown[]) {
    if (!entry || typeof entry !== 'object') return null;
    const ring = entry as Record<string, unknown>;
    if (!inRange(ring.r, 0, MAX_RADIUS_MM)) return null;
    if (!inRange(ring.v, 0, 1)) return null;
    rings.push({ r: ring.r, v: ring.v });
  }

  return {
    v: MARIMO_STATE_VERSION,
    seed: s.seed >>> 0,
    bornAt: s.bornAt,
    lastTickAt: s.lastTickAt,
    radiusMm: s.radiusMm,
    dent: s.dent,
    bias,
    facets,
    vigor: s.vigor,
    gas: s.gas,
    rings,
    restDir: [restDir[0] as number, restDir[1] as number, restDir[2] as number],
    turnCredit: s.turnCredit,
    fouling: s.fouling,
    lastWaterChangeAt: s.lastWaterChangeAt
  };
}

/**
 * Bring an older persisted shape forward. Adding v4 is one extra case here;
 * anything unknown returns null and the caller hatches a fresh marimo.
 *
 * Note what the v2 case has to do about `dent`. The flat spot used to be a
 * spherical-harmonic bulge, of which only about three fifths was visible; as a
 * plane cut all of it is, so `DENT_MAX` came down with the change. A stored
 * marimo sitting at the old maximum would now fail validation and be replaced
 * by a fresh one — which is the single worst thing this file could do, since
 * the pet may be months old. So it is clamped rather than rejected: the flat it
 * comes forward with is the same flat you could see before.
 */
export function migrate(raw: unknown): unknown | null {
  if (!raw || typeof raw !== 'object') return null;
  const version = (raw as { v?: unknown }).v;
  switch (version) {
    case MARIMO_STATE_VERSION:
      return raw;
    // v2 predates flat faces. Its baked-in flatness lives in `bias`, which
    // carries over untouched — so it comes forward looking exactly as it did,
    // and starts collecting proper facets from here.
    case 2: {
      const state = raw as { dent?: unknown };
      const dent = isFiniteNumber(state.dent) ? Math.min(Math.max(state.dent, 0), DENT_MAX) : 0;
      return { ...(raw as object), v: MARIMO_STATE_VERSION, dent, facets: [] };
    }
    // v1 predates permanent shape. A marimo that grew up under those rules only
    // ever had the transient flat spot, so it comes forward perfectly round —
    // which is what it in fact was.
    case 1:
      return migrate({ ...(raw as object), v: 2, bias: zeroShape() });
    default:
      return null;
  }
}

export function serializeMarimo(state: MarimoState): string {
  return JSON.stringify(state, (key, value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return value;
    if (EXACT_KEYS.has(key)) return value;
    return Number(value.toPrecision(6));
  });
}

export function parseMarimo(raw: string): MarimoState | null {
  try {
    return validateMarimoState(migrate(JSON.parse(raw)));
  } catch {
    return null;
  }
}

/**
 * The stored pet, or null if there is not one yet. Never throws.
 *
 * Separate from `loadMarimo` because the caller needs to tell "no marimo" from
 * "a fresh marimo" — that is the whole trigger for offering a choice of
 * fragments, and it has to be answered before anything is hatched.
 */
export function readMarimo(): MarimoState | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(MARIMO_STORAGE_KEY);
    return raw ? parseMarimo(raw) : null;
  } catch {
    /* storage unavailable — the pet degrades to ephemeral */
    return null;
  }
}

/** Loads the pet, or hatches a new one. Never throws. */
export function loadMarimo(nowMs: number): { state: MarimoState; hatched: boolean } {
  const state = readMarimo();
  return state ? { state, hatched: false } : { state: newMarimo(nowMs), hatched: true };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastWriteAt = 0;

/** Longest the pet may go unwritten while the page is open. */
const SAVE_MAX_WAIT_MS = 10_000;

function writeNow(state: MarimoState): void {
  try {
    localStorage.setItem(MARIMO_STORAGE_KEY, serializeMarimo(state));
    lastWriteAt = Date.now();
  } catch {
    /* quota or private browsing — the pet stays in memory for this session */
  }
}

/**
 * Debounced write with a maximum wait.
 *
 * The max wait is not optional: the care tick calls this once a second, so a
 * plain debounce longer than a second would have its timer reset every time and
 * never fire at all — leaving the pet unwritten for the entire session and lost
 * if the tab dies without a `pagehide`.
 */
export function saveMarimo(state: MarimoState, delayMs = 1500): void {
  if (!browser) return;
  if (lastWriteAt === 0) lastWriteAt = Date.now();

  if (Date.now() - lastWriteAt >= SAVE_MAX_WAIT_MS) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    writeNow(state);
    return;
  }

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeNow(state);
  }, delayMs);
}

/** Immediate write, for `pagehide` and `visibilitychange`. */
export function flushMarimo(state: MarimoState): void {
  if (!browser) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  writeNow(state);
}

export function clearMarimo(): void {
  if (!browser) return;
  try {
    localStorage.removeItem(MARIMO_STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
