/**
 * River stones: what one is, and how one is drawn out of a seed.
 *
 * A stone is not a mesh. It is a handful of numbers — a kind, an ellipsoid, a
 * lumpiness field, some flat faces, a banding plane — and everything else is
 * derived from them: the geometry the tank draws, the picture on the sticker,
 * and the spheres the physics collides. That is the whole reason this module has
 * no `three` import and no WebGL anywhere: the sticker sheet, the jar and the
 * solver must be looking at the same stone, and the cheapest way to guarantee it
 * is for there to be only one description of one.
 *
 * The shape is three things multiplied and cut together, and each does a job the
 * others cannot:
 *
 *  - An **ellipsoid**, which is what makes a stone a stone rather than a small
 *    grey marimo. Tumbled rock is oblate: it comes out of a river flat, because
 *    the flat ones survive the tumbling. Its short axis is local Y, so "lying
 *    the way a stone lies" is a low-energy state the physics finds by itself.
 *  - A **low-band spherical-harmonic field**, borrowed wholesale from the
 *    marimo's `sphericalHarmonics.ts`. Not a coincidence: a river stone and a
 *    marimo are the same problem — a rounded lump that has to read as *this
 *    particular* rounded lump from any angle — and that module already has the
 *    machinery, the clamp that stops a shape turning itself inside out, and the
 *    tests.
 *  - **Flat faces**, as plane cuts, from `facets.ts`. Bands of harmonics cannot
 *    make an edge; that module exists precisely because they cannot. Slate and
 *    flint are *broken* rock rather than worn rock, and a cleaved face with a
 *    rim on it is the whole difference between a pebble and a shard.
 */

import {
  FLOOR_Y,
  STONE_BED_DEPTH,
  STONE_PLACEMENT_TRIES,
  STONE_WALL_MARGIN,
  TANK_HALF_X,
  TANK_HALF_Z
} from './constants';
import { smoothMin } from './facets';
import { mulberry32 } from './rng';
import {
  SH_BAND,
  SH_COUNT,
  clampDeviation,
  deviationAt,
  peakDeviationRaw,
  zeroShape
} from './sphericalHarmonics';

// ------------------------------------------------------------------- catalogue

/**
 * One sort of rock. Everything here is a *range* rather than a value, because a
 * kind is a description of a quarry, not of a stone: two pieces of slate are
 * recognisably the same rock and recognisably not the same object, and the
 * sticker sheet is unconvincing the moment that stops being true.
 */
export interface StoneKind {
  id: string;
  /** What the caption on the sticker calls it. */
  name: string;
  /** Body colour, sRGB. */
  colour: number;
  /** Bands and veins, sRGB. */
  vein: number;
  /** Fine grain, sRGB — the speckle, where the kind has one. */
  grain: number;
  /** How strongly the bedding shows, 0..1. */
  banding: number;
  /** How many bands across the stone. */
  bandFreq: number;
  /** How strongly the fine grain shows, 0..1. */
  grainAmount: number;
  /** Specular sheen. Wet agate has one; basalt barely does. */
  gloss: number;
  /** Mean radius range, millimetres. */
  minRadiusMm: number;
  maxRadiusMm: number;
  /** Short-axis ratio range. Lower is flatter — slate is a wafer, quartz is not. */
  minFlatten: number;
  maxFlatten: number;
  /** Peak radial deviation as a fraction of mean radius. Higher is craggier. */
  roughness: number;
  /** How many cleaved faces it breaks along. Zero for wholly worn rock. */
  faces: number;
  /** How deep a face cuts, as a fraction of mean radius. */
  faceDepth: number;
  /**
   * How sharp the edge of a face is, as a fraction of mean radius.
   *
   * The marimo's own rim is soft because a marimo is three millimetres of wet
   * velvet and forgives everything. Rock does not forgive: a cleaved edge on
   * flint is a millimetre across at most, and a face with the marimo's rim on it
   * reads as a dent rather than a break.
   */
  faceRim: number;
}

/**
 * The box's contents.
 *
 * Eight, which is what fits a sheet two rows deep without the pictures getting
 * too small to tell apart, and chosen to span the axes that actually read at
 * sticker size: light against dark, banded against speckled, worn against
 * broken, flat against blocky. A ninth grey pebble would be a ninth grey pebble.
 */
export const STONE_KINDS: readonly StoneKind[] = Object.freeze([
  {
    id: 'agate',
    name: 'River agate',
    colour: 0xb4763f,
    vein: 0xe8cba4,
    grain: 0x8a5730,
    banding: 0.85,
    bandFreq: 9,
    grainAmount: 0.1,
    gloss: 0.55,
    minRadiusMm: 8,
    maxRadiusMm: 12,
    minFlatten: 0.52,
    maxFlatten: 0.72,
    roughness: 0.12,
    // Worn smooth in a riverbed for a few thousand years. No breaks left on it.
    faces: 0,
    faceDepth: 0,
    faceRim: 0.02
  },
  {
    id: 'slate',
    name: 'Blue slate',
    colour: 0x4a5763,
    vein: 0x39434d,
    grain: 0x5d6b78,
    banding: 0.55,
    bandFreq: 14,
    grainAmount: 0.18,
    gloss: 0.24,
    minRadiusMm: 10,
    maxRadiusMm: 15,
    minFlatten: 0.2,
    maxFlatten: 0.32,
    roughness: 0.18,
    // Slate splits along its bedding, so the two big faces are the flat ones.
    faces: 2,
    faceDepth: 0.1,
    faceRim: 0.012
  },
  {
    id: 'quartz',
    name: 'Milk quartz',
    colour: 0xd8d3c8,
    vein: 0xf4f1ea,
    grain: 0xb9b3a6,
    banding: 0.45,
    bandFreq: 4.5,
    grainAmount: 0.12,
    gloss: 0.5,
    minRadiusMm: 7,
    maxRadiusMm: 11,
    minFlatten: 0.62,
    maxFlatten: 0.86,
    roughness: 0.26,
    // Quartz has no cleavage; it fractures. Several faces, at any old angle.
    faces: 3,
    faceDepth: 0.13,
    faceRim: 0.018
  },
  {
    id: 'basalt',
    name: 'Basalt cobble',
    colour: 0x2f3134,
    vein: 0x25272a,
    grain: 0x51555a,
    banding: 0.16,
    bandFreq: 5,
    grainAmount: 0.48,
    gloss: 0.2,
    minRadiusMm: 10,
    maxRadiusMm: 15,
    minFlatten: 0.55,
    maxFlatten: 0.74,
    roughness: 0.15,
    faces: 1,
    faceDepth: 0.08,
    faceRim: 0.03
  },
  {
    id: 'jasper',
    name: 'Red jasper',
    colour: 0x8c3b2c,
    vein: 0xd8b391,
    grain: 0x6a2a20,
    banding: 0.7,
    bandFreq: 3.4,
    grainAmount: 0.26,
    gloss: 0.5,
    minRadiusMm: 7,
    maxRadiusMm: 10,
    minFlatten: 0.58,
    maxFlatten: 0.78,
    roughness: 0.18,
    faces: 0,
    faceDepth: 0,
    faceRim: 0.02
  },
  {
    id: 'granite',
    name: 'Speckled granite',
    colour: 0x9a958c,
    vein: 0xbfb9ad,
    grain: 0x3c3a38,
    banding: 0.14,
    bandFreq: 6,
    grainAmount: 0.6,
    gloss: 0.3,
    minRadiusMm: 11,
    maxRadiusMm: 16,
    minFlatten: 0.62,
    maxFlatten: 0.86,
    roughness: 0.16,
    // A quarried block that has been knocked about: blunt, but still cornered.
    faces: 4,
    faceDepth: 0.14,
    faceRim: 0.035
  },
  {
    id: 'serpentine',
    name: 'Green serpentine',
    colour: 0x4f6a4a,
    vein: 0x9fb387,
    grain: 0x3a5040,
    banding: 0.8,
    bandFreq: 6,
    grainAmount: 0.22,
    gloss: 0.45,
    minRadiusMm: 8,
    maxRadiusMm: 13,
    minFlatten: 0.42,
    maxFlatten: 0.62,
    roughness: 0.22,
    faces: 1,
    faceDepth: 0.09,
    faceRim: 0.022
  },
  {
    id: 'flint',
    name: 'Chalk-rimmed flint',
    colour: 0x3b3830,
    vein: 0xcfc7b4,
    grain: 0x4a463c,
    banding: 0.8,
    bandFreq: 2.6,
    grainAmount: 0.2,
    gloss: 0.62,
    minRadiusMm: 9,
    maxRadiusMm: 14,
    minFlatten: 0.5,
    maxFlatten: 0.75,
    roughness: 0.3,
    // Knapped: conchoidal fracture, sharp as glass and faced all over.
    faces: 5,
    faceDepth: 0.15,
    faceRim: 0.008
  }
] satisfies StoneKind[]);

export function stoneKindById(id: string): StoneKind | null {
  return STONE_KINDS.find((kind) => kind.id === id) ?? null;
}

// ------------------------------------------------------------------------ size

/** How big a stone was asked for. The kind still decides the range. */
export type StoneSize = 'small' | 'medium' | 'large';

export interface StoneSizeOption {
  id: StoneSize;
  label: string;
  /** Multiplier on whatever radius the kind's range drew. */
  scale: number;
}

/**
 * The three sizes on offer.
 *
 * Multipliers on the kind's own range rather than absolute millimetres, so a
 * large agate is still smaller than a large granite — the difference between
 * the rocks survives the choice, and picking "large" means "a big one of these"
 * rather than "one of the standard big ones".
 */
export const STONE_SIZES: readonly StoneSizeOption[] = Object.freeze([
  { id: 'small', label: 'Small', scale: 0.62 },
  { id: 'medium', label: 'Medium', scale: 1 },
  { id: 'large', label: 'Large', scale: 1.42 }
] satisfies StoneSizeOption[]);

export const DEFAULT_STONE_SIZE: StoneSize = 'medium';

export function stoneSizeById(id: string): StoneSizeOption {
  return STONE_SIZES.find((size) => size.id === id) ?? STONE_SIZES[1];
}

// ------------------------------------------------------------------- the stone

/** A cleaved face: a plane cut at `1 - depth` of the radius, facing `d`. */
export interface StoneFace {
  d: [number, number, number];
  depth: number;
}

/** One particular rock. Everything drawn or simulated is derived from this. */
export interface Stone {
  /** Which quarry. Indexes `STONE_KINDS`. */
  kind: string;
  /** Which of the three sizes it was asked for. */
  size: StoneSize;
  /** uint32. The stone is a pure function of this, the kind and the size. */
  seed: number;
  /** Mean radius, metres. */
  radiusM: number;
  /** Semi-axis multipliers of the mean radius, (x, y, z). Y is the short one. */
  axes: [number, number, number];
  /** Lumpiness, as the same 16 SH coefficients the marimo's shape uses. */
  coeffs: number[];
  /** Where it broke. Empty for rock that has been worn rather than split. */
  faces: StoneFace[];
  /** Blend width on those faces, fraction of radius. From the kind. */
  faceRim: number;
  /** Unit normal of the bedding plane, body frame. */
  bandAxis: [number, number, number];
  /** Where the banding starts, radians. */
  bandPhase: number;
}

/** A stone in the jar: which stone, and where it has come to rest. */
export interface PlacedStone {
  /** Unique for the life of the tank. Not persisted; the array order is. */
  id: number;
  stone: Stone;
  /** World position of the body's origin, metres. */
  position: [number, number, number];
  /** Orientation, xyzw. A stone can end up any way up now, so all four. */
  quaternion: [number, number, number, number];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function randomDirection(rand: () => number): [number, number, number] {
  const z = rand() * 2 - 1;
  const theta = rand() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(theta), r * Math.sin(theta), z];
}

/**
 * A lumpiness field scaled to the kind's roughness.
 *
 * Bands 1 to 3 only. l=0 is the mean radius and is already the stone's size, so
 * spending any of the budget there would only be a second way of saying the same
 * thing — and, worse, a way the sticker's caption would then be lying about. The
 * scaling aims at the *unclamped* peak, because past the clamp the drawn shape
 * stops responding and a kind asking for a craggier stone would silently get the
 * same one.
 */
export function stoneCoefficients(rand: () => number, roughness: number): number[] {
  const coeffs = zeroShape();
  for (let k = 0; k < SH_COUNT; k++) {
    const band = SH_BAND[k];
    if (band === 0) continue;
    // Higher bands are finer detail, and a stone as bumpy at l=3 as it is
    // lopsided at l=1 reads as gravel rather than as a river cobble.
    coeffs[k] = (rand() * 2 - 1) / band;
  }

  const peak = peakDeviationRaw(coeffs);
  if (peak <= 0) return coeffs;
  const scale = roughness / peak;
  for (let k = 0; k < SH_COUNT; k++) coeffs[k] *= scale;
  return coeffs;
}

/**
 * Where a stone of this kind breaks.
 *
 * Slate is the special case and the reason this is not just N random
 * directions: it splits *along its bedding*, so its two faces are the top and
 * the bottom and they are parallel. Everything else fractures every which way.
 */
export function stoneFaces(rand: () => number, kind: StoneKind): StoneFace[] {
  const faces: StoneFace[] = [];
  if (kind.faces <= 0 || kind.faceDepth <= 0) return faces;

  const bedded = kind.id === 'slate';
  for (let i = 0; i < kind.faces; i++) {
    let d: [number, number, number];
    if (bedded) {
      // Up and down, give or take: a split sheet is not perfectly parallel.
      const sign = i % 2 === 0 ? 1 : -1;
      const [jx, , jz] = randomDirection(rand);
      d = [jx * 0.12, sign, jz * 0.12];
      const len = Math.hypot(d[0], d[1], d[2]);
      d = [d[0] / len, d[1] / len, d[2] / len];
    } else {
      d = randomDirection(rand);
    }
    // Depth varies across the faces so one dominates and the rest chip at it,
    // which is what a knapped edge actually looks like.
    faces.push({ d, depth: kind.faceDepth * (0.55 + rand() * 0.45) });
  }
  return faces;
}

/**
 * Draw one stone of `kind` at `size` from `seed`.
 *
 * Pure: the same three inputs give the same rock, forever. That is what lets
 * the sticker be a photograph of the stone it hands you, and what lets the file
 * on disk store three fields and rebuild the rest.
 */
export function makeStone(
  kind: StoneKind,
  seed: number,
  size: StoneSize = DEFAULT_STONE_SIZE
): Stone {
  const rand = mulberry32(seed >>> 0);

  const radiusMm = lerp(kind.minRadiusMm, kind.maxRadiusMm, rand()) * stoneSizeById(size).scale;
  const flatten = lerp(kind.minFlatten, kind.maxFlatten, rand());
  // The two long axes differ a little, so a stone seen from above is an oval
  // rather than a disc — and so which way round it lies is worth something.
  const stretch = 1 + rand() * 0.3;

  // The bedding runs across the stone rather than through its flat faces:
  // tumbling wears the ends off a banded rock, so the bands show on the top.
  const [bx, by, bz] = randomDirection(rand);

  return {
    kind: kind.id,
    size,
    seed: seed >>> 0,
    radiusM: radiusMm / 1000,
    axes: [stretch, flatten, 1 / Math.sqrt(stretch)],
    coeffs: stoneCoefficients(rand, kind.roughness),
    faces: stoneFaces(rand, kind),
    faceRim: kind.faceRim,
    bandAxis: [bx, by * 0.35, bz],
    bandPhase: rand() * Math.PI * 2
  };
}

/**
 * The seed for one slot of the sheet.
 *
 * Four inputs, all of them small integers, so they are mixed rather than added:
 * added, slot 3 of generation 4 would be the same number as slot 4 of
 * generation 3, and the sheet would quietly offer the same rock twice under two
 * different stickers.
 */
export function sheetSlotSeed(sheetSeed: number, slot: number, generation: number): number {
  const rand = mulberry32((sheetSeed ^ (slot * 0x9e3779b9) ^ (generation * 0x85ebca6b)) >>> 0);
  rand();
  return Math.floor(rand() * 4294967296) >>> 0;
}

/** Fold the chosen kind and size into the sheet's seed. */
function offerSeed(sheetSeed: number, kindId: string, size: StoneSize): number {
  let hash = sheetSeed >>> 0;
  for (const character of `${kindId}:${size}`) {
    hash = (Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0) >>> 0;
  }
  return hash;
}

/**
 * What the box is currently offering: `count` shapes of one rock at one size.
 *
 * The sheet used to be one sticker per kind, which was a nice thing to look at
 * and a poor thing to choose from — the only axis it offered was which rock, and
 * the shape you got was whatever the seed happened to draw. Splitting the choice
 * into colour, size and shape puts all three in the visitor's hands, and makes
 * the row of stickers a row of genuine alternatives rather than a catalogue.
 *
 * `generations` is one counter per slot. Rerolling bumps all of them; taking a
 * sticker bumps only the one it came from, so the slot you peeled shows the next
 * stone down the pile and the other three are exactly where you left them.
 */
export function stoneOffers(
  sheetSeed: number,
  kindId: string,
  size: StoneSize,
  generations: readonly number[],
  count = generations.length
): Stone[] {
  const kind = stoneKindById(kindId) ?? STONE_KINDS[0];
  const base = offerSeed(sheetSeed, kind.id, size);
  return Array.from({ length: count }, (_, slot) =>
    makeStone(kind, sheetSlotSeed(base, slot, generations[slot] ?? 0), size)
  );
}

/** Mean diameter in millimetres, for the sticker's caption. */
export function stoneDiameterMm(stone: Stone): number {
  return stone.radiusM * 2000;
}

/**
 * Surface point along a unit direction, in metres, body frame.
 *
 * The one description of the shape. The geometry builder walks it over an
 * icosphere, the collision spheres are fitted inside it, the extents are
 * sampled from it, and the sticker draws whatever it says.
 *
 * The face cuts are applied here rather than by calling `surfaceScale` from
 * `facets.ts`, for one reason: that function hard-codes the marimo's rim, which
 * is soft because a marimo is wet velvet. The arithmetic is the same `smoothMin`
 * against the same plane — imported, not copied — with the kind's own rim.
 */
export function stoneSurface(
  stone: Stone,
  dx: number,
  dy: number,
  dz: number,
  out: [number, number, number]
): [number, number, number] {
  let scale = 1 + clampDeviation(deviationAt(stone.coeffs, dx, dy, dz));

  for (const face of stone.faces) {
    const towards = face.d[0] * dx + face.d[1] * dy + face.d[2] * dz;
    // Edge-on or behind: the plane is not in front of this direction, so it
    // cuts nothing here. Also what keeps the division below away from zero.
    if (towards <= 1e-3) continue;
    scale = smoothMin(scale, (1 - face.depth) / towards, Math.min(stone.faceRim, face.depth));
  }

  const r = stone.radiusM * scale;
  out[0] = dx * stone.axes[0] * r;
  out[1] = dy * stone.axes[1] * r;
  out[2] = dz * stone.axes[2] * r;
  return out;
}

// -------------------------------------------------------------------- surface

/**
 * How much of the way to the vein colour the brightest band gets.
 *
 * Never all the way. A vein is a different mineral in the same rock, and it is
 * seen through the same wet surface under the same light — one that reached the
 * pure swatch colour would read as paint.
 */
const VEIN_CEILING = 0.72;

/** Deterministic value noise on the sphere. Cheap, and it never has to be fast. */
function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * How the surface is coloured at a direction.
 *
 * `vein` runs 0 to 1 from body colour to the vein's. `grain` is *signed*: the
 * speckle goes toward the dark mineral one way and the light one the other,
 * and averages to nothing.
 *
 * That sign is not a detail. An unsigned speckle is a one-way mix, so a rock
 * with a lot of it comes out uniformly closer to whatever the fleck colour is —
 * which turned pale granite into a dark brown lump the moment its speckle was
 * turned up, and made the swatch on the sheet a lie about the stone. Granite is
 * pale *because* it is a mixture of light and dark grains; a model of that has
 * to be able to go both ways.
 *
 * Baked per vertex rather than evaluated per fragment. Not for the cost — this
 * is a handful of stones — but because it keeps the whole appearance of a stone
 * derivable on the CPU, which is what lets the sticker and the jar be checked
 * against each other by a test rather than by looking at them.
 */
export function stoneSurfaceMix(
  stone: Stone,
  kind: StoneKind,
  dx: number,
  dy: number,
  dz: number
): { vein: number; grain: number } {
  const along = dx * stone.bandAxis[0] + dy * stone.bandAxis[1] + dz * stone.bandAxis[2];
  // Bands as `|sin|` raised to a power: the peaks stay thin, which is what a
  // vein looks like. A plain sine gives an evenly two-toned rock.
  //
  // The exponent is high, and it has to be. `along` only sweeps a couple of
  // radians across a whole stone, so at a cube the crests are broad enough to
  // cover half the surface — which turned chalk-rimmed flint into a chalk
  // pebble, and made two stones of one kind read as two different rocks
  // depending on where the phase happened to fall. At a fifth power the vein is
  // a band on a rock rather than the rock.
  const wave = Math.abs(Math.sin(along * kind.bandFreq + stone.bandPhase));
  const vein = Math.pow(wave, 5) * kind.banding * VEIN_CEILING;

  // Three octaves, at a scale set by the stone's own size so a big cobble is
  // not simply a small one drawn larger.
  const f = 9 / Math.max(stone.radiusM * 100, 0.3);
  const noise =
    hash3(dx * f, dy * f, dz * f) * 0.55 +
    hash3(dx * f * 2.7 + 5.2, dy * f * 2.7 + 1.3, dz * f * 2.7 + 9.1) * 0.3 +
    hash3(dx * f * 6.1 + 17.3, dy * f * 6.1 + 4.7, dz * f * 6.1 + 2.9) * 0.15;

  return { vein, grain: (noise - 0.5) * 2 * kind.grainAmount };
}

// ----------------------------------------------------------------- collision

/** Directions the shape is sampled along for hull points and extents. */
const SAMPLE_COUNT = 192;
const sampleDirs: [number, number, number][] = (() => {
  // A Fibonacci spiral: as close to evenly spread over the sphere as anything
  // that can be written in four lines, and — unlike a random set — the same
  // every run, which the physics depends on: the hull Jolt builds from these
  // points must be the same hull every visit, or a stone would settle
  // differently after a reload than it did before one.
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: SAMPLE_COUNT }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / SAMPLE_COUNT;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    return [r * Math.cos(theta), y, r * Math.sin(theta)] as [number, number, number];
  });
})();

const surfaceScratch: [number, number, number] = [0, 0, 0];

/**
 * The stone's surface as a point cloud, flat xyz triples, for a convex hull.
 *
 * Every direction the shape is sampled along, which is a good deal more than a
 * hull needs — the builder discards everything interior, and what survives is
 * the silhouette. Sampling the same directions the extents use means the hull
 * and the drawn mesh are the same solid to within the sampling, rather than two
 * approximations of a third thing.
 *
 * Convex is a real assumption and worth stating: a stone with a deep scoop in it
 * would collide as though the scoop were filled. None of these have one. The
 * shapes here are an ellipsoid, some low-band lumps and some plane cuts, and all
 * three of those are convex or nearly so — a plane cut on a convex body is
 * exactly convex, and the harmonics are clamped well short of what it would take
 * to fold the surface back on itself.
 */
export function stoneHullPoints(stone: Stone): number[] {
  const points: number[] = [];
  for (const [dx, dy, dz] of sampleDirs) {
    stoneSurface(stone, dx, dy, dz, surfaceScratch);
    points.push(surfaceScratch[0], surfaceScratch[1], surfaceScratch[2]);
  }
  return points;
}

/** Half-extents of the shape, metres, in its own frame. */
export function stoneExtents(stone: Stone): [number, number, number] {
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  for (const [dx, dy, dz] of sampleDirs) {
    stoneSurface(stone, dx, dy, dz, surfaceScratch);
    maxX = Math.max(maxX, Math.abs(surfaceScratch[0]));
    maxY = Math.max(maxY, Math.abs(surfaceScratch[1]));
    maxZ = Math.max(maxZ, Math.abs(surfaceScratch[2]));
  }
  return [maxX, maxY, maxZ];
}

// ------------------------------------------------------------------- placement

/** Where a stone of these extents sits when it has settled flat on the gravel. */
export function restingY(extents: readonly [number, number, number]): number {
  return FLOOR_Y + Math.max(extents[1] - STONE_BED_DEPTH, extents[1] * 0.35);
}

/** The stone's reach in the horizontal plane, whichever way it is turned. */
export function footprint(extents: readonly [number, number, number]): number {
  return Math.hypot(extents[0], extents[2]);
}

/** A stone already down, as the placement search needs to see it. */
export interface Occupant {
  x: number;
  z: number;
  footprint: number;
}

/**
 * Somewhere to put a stone: inside the glass, and not on top of anything.
 *
 * Rejection sampling with a fallback, rather than a packing solver. A jar with
 * eight stones in it is not a packing problem, and the failure mode of the
 * simple version is right: when the floor really is full the best of the tries
 * is returned anyway, so the stone lands leaning on its neighbours — which the
 * physics now handles — instead of the box refusing a click for reasons the
 * visitor cannot see.
 *
 * `preferred` is where the pointer asked for, when there was a pointer. It is
 * tried first and unmodified, so a deliberate drop into open gravel goes exactly
 * where it was aimed and only a crowded one gets nudged.
 */
export function findPlacement(
  extents: readonly [number, number, number],
  occupants: readonly Occupant[],
  rand: () => number,
  preferred?: { x: number; z: number }
): { x: number; z: number } {
  const reach = footprint(extents);
  const limitX = Math.max(0, TANK_HALF_X - reach - STONE_WALL_MARGIN);
  const limitZ = Math.max(0, TANK_HALF_Z - reach - STONE_WALL_MARGIN);

  const clampToFloor = (x: number, z: number) => ({
    x: Math.min(Math.max(x, -limitX), limitX),
    z: Math.min(Math.max(z, -limitZ), limitZ)
  });

  /** How far into its nearest neighbour a candidate is. Zero is clear. */
  const overlap = (x: number, z: number) => {
    let worst = 0;
    for (const other of occupants) {
      const gap = Math.hypot(x - other.x, z - other.z) - (reach + other.footprint);
      if (gap < 0) worst = Math.max(worst, -gap);
    }
    return worst;
  };

  // With nothing aimed — a keyboard press, or a tap — the search starts
  // somewhere random rather than in the middle. Starting in the middle is
  // tidier for exactly one stone and wrong for every one after it: the centre
  // is where the marimo lives, and a second press would begin its search from
  // inside the first stone and shuffle out along one arm of the spiral.
  let best = preferred
    ? clampToFloor(preferred.x, preferred.z)
    : clampToFloor((rand() * 2 - 1) * limitX, (rand() * 2 - 1) * limitZ);
  let bestOverlap = overlap(best.x, best.z);
  if (bestOverlap === 0) return best;

  for (let attempt = 0; attempt < STONE_PLACEMENT_TRIES; attempt++) {
    // Spiral outward from where it was asked for, so a crowded drop lands next
    // to the pointer rather than on the far side of the jar.
    const spread = (attempt + 1) / STONE_PLACEMENT_TRIES;
    const angle = rand() * Math.PI * 2;
    const distance = spread * Math.hypot(limitX, limitZ);
    const candidate = clampToFloor(
      best.x + Math.cos(angle) * distance,
      best.z + Math.sin(angle) * distance
    );

    const score = overlap(candidate.x, candidate.z);
    if (score === 0) return candidate;
    if (score < bestOverlap) {
      bestOverlap = score;
      best = candidate;
    }
  }

  return best;
}
