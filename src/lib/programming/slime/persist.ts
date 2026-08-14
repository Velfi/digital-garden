import { browser } from '$app/environment';
import { INITIAL_RADIUS_MM, MAX_RADIUS_MM } from './constants';
import { randomSeed } from '../marimo/rng';
import { BREED_IDS, type BreedId } from './breeds';
import type { SlimeStage, SlimeState } from './types';

/**
 * The only module that touches localStorage.
 *
 * Load path is migrate-then-validate-then-fall-back, on the marimo `persist.ts`
 * pattern (which in turn follows `src/routes/badger/store/index.ts`). Anything
 * unrecognised or corrupt yields a fresh arrival rather than throwing — and a
 * fresh arrival is a *sclerotium in the post*, not an awake slime: the
 * unrevived crust is the onboarding. If storage is unavailable entirely
 * (Safari private browsing) the pet degrades to ephemeral.
 */

export const SLIME_STATE_VERSION = 3;
export const SLIME_STORAGE_KEY = 'slime-terrarium-v1';

/** Fields that must survive serialisation exactly — epoch ms and integers. */
const EXACT_KEYS = new Set([
  'v',
  'seed',
  'bornAt',
  'lastTickAt',
  'lastMistAt',
  'lastFedAt',
  'revivals'
]);

const STAGES: readonly SlimeStage[] = ['sclerotium', 'waking', 'active'];

export function newSlime(nowMs: number, seed: number = randomSeed()): SlimeState {
  return {
    v: SLIME_STATE_VERSION,
    seed,
    // Unregistered until the arrival paperwork is done — the breed picker
    // stamps it via the scene's `setBreed`.
    breed: null,
    bornAt: nowMs,
    lastTickAt: nowMs,
    // It arrives dormant, dry, and patient — on its square of filter paper.
    stage: 'sclerotium',
    revival: 0,
    revivals: 0,
    drySec: 0,
    moisture: 0.05,
    satiety: 0,
    vigor: 0.3,
    radiusMm: INITIAL_RADIUS_MM,
    sparkle: 0,
    lastMistAt: 0,
    lastFedAt: 0
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inRange(value: unknown, lo: number, hi: number): value is number {
  return isFiniteNumber(value) && value >= lo && value <= hi;
}

/** Structural + range validation. Null on anything suspect; the caller re-ships a fresh crust. */
export function validateSlimeState(raw: unknown): SlimeState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;

  if (s.v !== SLIME_STATE_VERSION) return null;
  if (!isFiniteNumber(s.seed)) return null;
  if (!isFiniteNumber(s.bornAt) || !isFiniteNumber(s.lastTickAt)) return null;
  if (!isFiniteNumber(s.lastMistAt) || !isFiniteNumber(s.lastFedAt)) return null;
  if (typeof s.stage !== 'string' || !STAGES.includes(s.stage as SlimeStage)) return null;
  if (!inRange(s.revival, 0, 1.001)) return null;
  if (!isFiniteNumber(s.revivals) || s.revivals < 0 || s.revivals > 10_000) return null;
  if (!isFiniteNumber(s.drySec) || s.drySec < 0) return null;
  if (!inRange(s.moisture, 0, 1)) return null;
  if (!inRange(s.satiety, 0, 1)) return null;
  if (!inRange(s.vigor, 0, 1)) return null;
  if (!inRange(s.radiusMm, 1, MAX_RADIUS_MM * 1.01)) return null;
  if (!inRange(s.sparkle, 0, 1)) return null;

  return {
    v: SLIME_STATE_VERSION,
    seed: (s.seed as number) >>> 0,
    // A breed retired from the catalogue demotes to unregistered rather than
    // re-shipping the pet — losing the pedigree must never cost the animal.
    breed: BREED_IDS.includes(s.breed as BreedId) ? (s.breed as BreedId) : null,
    bornAt: s.bornAt as number,
    lastTickAt: s.lastTickAt as number,
    stage: s.stage as SlimeStage,
    revival: Math.min(s.revival as number, 1),
    revivals: Math.round(s.revivals as number),
    drySec: s.drySec as number,
    moisture: s.moisture as number,
    satiety: s.satiety as number,
    vigor: s.vigor as number,
    radiusMm: Math.min(s.radiusMm as number, MAX_RADIUS_MM),
    sparkle: s.sparkle as number,
    lastMistAt: s.lastMistAt as number,
    lastFedAt: s.lastFedAt as number
  };
}

/**
 * Bring an older persisted shape forward, one version at a time. v2 added
 * `sparkle`, earned by mica; v3 added `breed`, null for pets from before the
 * breeder kept records.
 */
export function migrate(raw: unknown): unknown | null {
  if (!raw || typeof raw !== 'object') return null;
  let s = raw as Record<string, unknown>;
  if (s.v === 1) s = { ...s, v: 2, sparkle: 0 };
  if (s.v === 2) s = { ...s, v: 3, breed: null };
  return s.v === SLIME_STATE_VERSION ? s : null;
}

export function serializeSlime(state: SlimeState): string {
  return JSON.stringify(state, (key, value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return value;
    if (EXACT_KEYS.has(key)) return value;
    return Number(value.toPrecision(6));
  });
}

export function parseSlime(raw: string): SlimeState | null {
  try {
    return validateSlimeState(migrate(JSON.parse(raw)));
  } catch {
    return null;
  }
}

export const TANK_SEED_KEY = 'slime-tank-id-v1';

/**
 * The browser's own tank, as a seed. Separate from the pet on purpose: the
 * pet's seed ships with the pet and is replaced with it, but the *tank* —
 * where the mounds rose, how the moss clumped, the grain of the soil — is
 * the visitor's furniture. It is minted once per browser, so everyone's
 * terrarium is laid out a little differently, and ordering a new slime
 * delivers a new animal into the *same* tank. Storage unavailable (private
 * browsing) degrades to a fresh layout per visit rather than an error.
 */
export function loadTankSeed(): number {
  // SSR renders no scene; any stable number will do.
  if (!browser) return 0x7a219;
  try {
    const raw = localStorage.getItem(TANK_SEED_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    if (Number.isFinite(parsed)) return parsed >>> 0;
    const seed = randomSeed();
    localStorage.setItem(TANK_SEED_KEY, String(seed));
    return seed;
  } catch {
    return randomSeed();
  }
}

/** The stored pet, or null if there is not one yet. Never throws. */
export function readSlime(): SlimeState | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(SLIME_STORAGE_KEY);
    return raw ? parseSlime(raw) : null;
  } catch {
    /* storage unavailable — the pet degrades to ephemeral */
    return null;
  }
}

/** Loads the pet, or takes delivery of a new one. Never throws. */
export function loadSlime(nowMs: number): { state: SlimeState; arrived: boolean } {
  const state = readSlime();
  return state ? { state, arrived: false } : { state: newSlime(nowMs), arrived: true };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastWriteAt = 0;

/** Longest the pet may go unwritten while the page is open. */
const SAVE_MAX_WAIT_MS = 10_000;

function writeNow(state: SlimeState): void {
  try {
    localStorage.setItem(SLIME_STORAGE_KEY, serializeSlime(state));
    lastWriteAt = Date.now();
  } catch {
    /* quota or private browsing — the pet stays in memory for this session */
  }
}

/**
 * Debounced write with a maximum wait — the care tick calls this once a
 * second, and a plain debounce would never fire. See marimo persist.ts.
 */
export function saveSlime(state: SlimeState, delayMs = 1500): void {
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
export function flushSlime(state: SlimeState): void {
  if (!browser) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  writeNow(state);
}

export const GRIME_STORAGE_KEY = 'slime-grime-v1';

/**
 * The panes' dried-on film, as an opaque blob (see `grimePersist.ts` for its
 * shape and the offline simulation). Stored under its own key beside the tank
 * seed, and like the tank it is the *browser's*: ordering a new slime ships a
 * new animal into the same smeared box. ~65 KB, so it gets its own slower
 * debounce rather than riding the pet's.
 */
export function readGrime(): string | null {
  if (!browser) return null;
  try {
    return localStorage.getItem(GRIME_STORAGE_KEY);
  } catch {
    return null;
  }
}

let grimeTimer: ReturnType<typeof setTimeout> | null = null;
let lastGrimeWriteAt = 0;
const GRIME_SAVE_DELAY_MS = 5000;
const GRIME_SAVE_MAX_WAIT_MS = 30_000;

function writeGrimeNow(serialize: () => string): void {
  try {
    localStorage.setItem(GRIME_STORAGE_KEY, serialize());
    lastGrimeWriteAt = Date.now();
  } catch {
    /* quota or private browsing — the smears stay in memory this session */
  }
}

/**
 * Debounced write with a maximum wait, on the `saveSlime` pattern. Takes a
 * thunk so the once-a-second care tick never pays for serialisation — only
 * the write that actually lands does.
 */
export function saveGrime(serialize: () => string, delayMs = GRIME_SAVE_DELAY_MS): void {
  if (!browser) return;
  if (lastGrimeWriteAt === 0) lastGrimeWriteAt = Date.now();

  if (Date.now() - lastGrimeWriteAt >= GRIME_SAVE_MAX_WAIT_MS) {
    if (grimeTimer) {
      clearTimeout(grimeTimer);
      grimeTimer = null;
    }
    writeGrimeNow(serialize);
    return;
  }

  if (grimeTimer) clearTimeout(grimeTimer);
  grimeTimer = setTimeout(() => {
    grimeTimer = null;
    writeGrimeNow(serialize);
  }, delayMs);
}

/** Immediate write, for `pagehide`, `visibilitychange` and dispose. */
export function flushGrime(serialize: () => string): void {
  if (!browser) return;
  if (grimeTimer) {
    clearTimeout(grimeTimer);
    grimeTimer = null;
  }
  writeGrimeNow(serialize);
}

export function clearSlime(): void {
  if (!browser) return;
  try {
    localStorage.removeItem(SLIME_STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
