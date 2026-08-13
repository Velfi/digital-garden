/**
 * What is in the jar besides the marimo, and the sheet it came off.
 *
 * Its own storage key, and deliberately so. The pet's file is
 * migrate-then-validate-then-*throw the pet away*, which is the only safe policy
 * for a thing that cannot be reconstructed — and exactly the wrong one here: a
 * corrupt stone is a stone, and losing a month-old marimo because a rock failed
 * a range check would be indefensible. So this file drops what it cannot read,
 * one stone at a time, and keeps the rest. The two never share a parse.
 *
 * Only three numbers per stone are stored. A stone is a pure function of its
 * kind and seed — that is what `stones.ts` is for — so the shape, the colour,
 * the banding and the size are all rebuilt on load rather than written down, and
 * a stone cannot come back looking like a different rock.
 */

import { browser } from '$app/environment';
import {
  FLOOR_Y,
  STONE_MAX_IN_TANK,
  STONE_OFFER_COUNT,
  TANK_HALF_X,
  TANK_HALF_Z,
  WATER_Y
} from './constants';
import { randomSeed } from './rng';
import {
  DEFAULT_STONE_SIZE,
  STONE_KINDS,
  STONE_SIZES,
  stoneKindById,
  type StoneSize
} from './stones';

export const MARIMO_DECOR_VERSION = 2;
export const MARIMO_DECOR_KEY = 'marimo-decor-v1';

/**
 * One stone as it is written down: which rock, and the pose it stopped in.
 *
 * The pose is a full one now that the stones are bodies. Before they could
 * move, where a stone lay was two numbers and a yaw, because the only way for
 * one to be resting was flat on the gravel; a stone that can be shoved into a
 * corner, tipped onto an edge or left leaning on its neighbour needs all seven.
 */
export interface StoredStone {
  /** A `StoneKind` id. */
  k: string;
  /** uint32 seed. */
  s: number;
  /** Which size it was drawn at. Absent means medium. */
  z?: StoneSize;
  /** Position, metres. */
  p: [number, number, number];
  /** Orientation, xyzw. */
  q: [number, number, number, number];
}

export interface DecorState {
  v: number;
  /**
   * The sheet's own seed. Kept so the box has the same stones in it every
   * visit: a sheet you have looked at twice is the same sheet, and one that
   * reshuffles itself overnight is a slot machine.
   */
  sheetSeed: number;
  /** Which rock the box is currently offering. A `StoneKind` id. */
  kind: string;
  /** Which size it is offering them at. */
  size: StoneSize;
  /**
   * One counter per slot on the sheet.
   *
   * Rerolling bumps all of them; peeling a sticker bumps only the slot it came
   * from. That is the difference between "give me four new ones" and "I took
   * that one" — and keeping them apart is what stops taking a stone from
   * quietly changing the other three you were still deciding between.
   */
  gen: number[];
  stones: StoredStone[];
}

export function newDecor(sheetSeed: number = randomSeed()): DecorState {
  return {
    v: MARIMO_DECOR_VERSION,
    sheetSeed,
    kind: STONE_KINDS[0].id,
    size: DEFAULT_STONE_SIZE,
    gen: new Array<number>(STONE_OFFER_COUNT).fill(0),
    stones: []
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inRange(value: unknown, lo: number, hi: number): value is number {
  return isFiniteNumber(value) && value >= lo && value <= hi;
}

/**
 * Per-stone validation. A stone that fails is dropped and the rest are kept.
 *
 * The bounds are the jar's, with slack: the exact limit depends on the stone's
 * own extents, which are not known until the geometry is built, and a stone
 * saved right against the glass must not fail to come back for being a tenth of
 * a millimetre outside a limit computed a different way. Anything genuinely
 * wild — a hand-edited coordinate on the far side of the room — is still caught.
 */
export function validateStone(raw: unknown): StoredStone | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;

  if (typeof s.k !== 'string' || !stoneKindById(s.k)) return null;
  if (!isFiniteNumber(s.s)) return null;

  if (!Array.isArray(s.p) || s.p.length !== 3) return null;
  if (!inRange(s.p[0], -TANK_HALF_X, TANK_HALF_X)) return null;
  if (!inRange(s.p[1], FLOOR_Y - 0.01, WATER_Y + 0.02)) return null;
  if (!inRange(s.p[2], -TANK_HALF_Z, TANK_HALF_Z)) return null;

  if (!Array.isArray(s.q) || s.q.length !== 4) return null;
  for (const component of s.q) {
    if (!inRange(component, -1.001, 1.001)) return null;
  }
  // A quaternion that is not a rotation would shear the stone. Renormalised
  // rather than rejected, since rounding to six figures on the way out can
  // leave the length a hair off one.
  const length = Math.hypot(s.q[0] as number, s.q[1] as number, s.q[2] as number, s.q[3] as number);
  if (!(length > 0.5)) return null;

  const size = STONE_SIZES.some((option) => option.id === s.z)
    ? (s.z as StoneSize)
    : DEFAULT_STONE_SIZE;

  return {
    k: s.k,
    s: s.s >>> 0,
    z: size,
    p: [s.p[0] as number, s.p[1] as number, s.p[2] as number],
    q: [
      (s.q[0] as number) / length,
      (s.q[1] as number) / length,
      (s.q[2] as number) / length,
      (s.q[3] as number) / length
    ]
  };
}

/**
 * Bring an older box forward.
 *
 * v1 predates the stones being able to move: it stored an x, a z and a yaw, and
 * nothing else, because flat on the gravel was the only pose there was. The
 * height is not recoverable from it — it depended on the stone's extents, which
 * are not in the file — so a v1 stone comes back at the waterline and is allowed
 * to fall the last few centimetres to wherever it now belongs. Which is a
 * rounder answer than it sounds: it lands where the physics says it should,
 * rather than where an older and cruder rule put it.
 *
 * A v1 box also had no colour, size or slot state, because it had no controls.
 * Those simply come back at their defaults, which `newDecor` supplies and this
 * function therefore does not have to.
 */
export function migrateDecor(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const d = raw as Record<string, unknown>;
  if (d.v !== 1 || !Array.isArray(d.stones)) return raw;

  const stones = d.stones.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const stone = entry as Record<string, unknown>;
    const yaw = isFiniteNumber(stone.y) ? stone.y : 0;
    const half = yaw / 2;
    return {
      k: stone.k,
      s: stone.s,
      p: [stone.x, WATER_Y, stone.z],
      q: [0, Math.sin(half), 0, Math.cos(half)]
    };
  });

  return { ...d, v: MARIMO_DECOR_VERSION, stones };
}

/** Whole-file validation. Never returns null: an unreadable box is an empty box. */
export function validateDecor(unmigrated: unknown): DecorState {
  const decor = newDecor();
  const raw = migrateDecor(unmigrated);
  if (!raw || typeof raw !== 'object') return decor;
  const d = raw as Record<string, unknown>;
  if (d.v !== MARIMO_DECOR_VERSION) return decor;

  if (isFiniteNumber(d.sheetSeed)) decor.sheetSeed = d.sheetSeed >>> 0;
  if (typeof d.kind === 'string' && stoneKindById(d.kind)) decor.kind = d.kind;
  if (STONE_SIZES.some((option) => option.id === d.size)) decor.size = d.size as StoneSize;

  if (Array.isArray(d.gen)) {
    for (let slot = 0; slot < STONE_OFFER_COUNT; slot++) {
      const count = d.gen[slot];
      // Bounded, so a corrupt counter cannot hand out a generation number the
      // seed mixer has never been exercised on.
      if (inRange(count, 0, 100000)) decor.gen[slot] = Math.floor(count);
    }
  }

  if (Array.isArray(d.stones)) {
    for (const entry of d.stones) {
      const stone = validateStone(entry);
      if (stone) decor.stones.push(stone);
      if (decor.stones.length >= STONE_MAX_IN_TANK) break;
    }
  }

  return decor;
}

export function loadDecor(): DecorState {
  if (!browser) return newDecor();
  try {
    const raw = localStorage.getItem(MARIMO_DECOR_KEY);
    return validateDecor(raw ? JSON.parse(raw) : null);
  } catch {
    return newDecor();
  }
}

export function saveDecor(decor: DecorState): void {
  if (!browser) return;
  try {
    localStorage.setItem(
      MARIMO_DECOR_KEY,
      JSON.stringify(decor, (key, value) =>
        typeof value === 'number' &&
        Number.isFinite(value) &&
        (key === 'x' || key === 'z' || key === 'y')
          ? Number(value.toPrecision(6))
          : value
      )
    );
  } catch {
    /* quota or private browsing — the stones hold for this session */
  }
}
