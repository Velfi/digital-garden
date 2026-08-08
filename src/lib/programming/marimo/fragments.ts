/**
 * Starter fragments: the torn-off pieces offered when there is no marimo yet.
 *
 * A fragment is not a special kind of marimo. It is an ordinary one that starts
 * small and starts crooked, using the same `bias` field a grown marimo would
 * accumulate by sitting still — so the shape you pick here and the shape it ends
 * up with a year later are the same quantity, and one grows continuously out of
 * the other. Pick a ragged one and turn it faithfully and it will round out;
 * pick a round one and never turn it and it will not stay round.
 *
 * The three on offer are graded rather than random: one mostly round, one a
 * little lumpy, one very. See `FRAGMENT_GRADES`.
 */

import {
  BIAS_MAX,
  FRAGMENT_BAND_TILT,
  FRAGMENT_GRADES,
  FRAGMENT_LAYOUT_TRIES,
  FRAGMENT_MAX_RADIUS_MM,
  FRAGMENT_MIN_RADIUS_MM,
  FRAGMENT_SATELLITE_DEPTH,
  type FragmentGrade
} from './constants';
import type { Facet } from './facets';
import { newMarimo } from './persist';
import { mulberry32, randomSeed } from './rng';
import {
  DENT_UNIT_NORM,
  SH_COUNT,
  addShapes,
  capShape,
  deviationAt,
  extremeDirection,
  shapeMagnitude,
  shapeRoughness,
  tiltedDentCoefficients,
  zeroShape
} from './sphericalHarmonics';
import type { MarimoState } from './types';

export interface FragmentStarter {
  /** Drives strand jitter and gravel layout once it is a marimo. */
  seed: number;
  radiusMm: number;
  /** Starting permanent shape, in the same units as `MarimoState.bias`. */
  bias: number[];
  /** The flat where it tore away, if it has one. Same units as a grown facet. */
  facets: Facet[];
  /** Index into `FRAGMENT_GRADES` — which of the three this one was drawn as. */
  grade: number;
  /** Plain description for the chooser: how big, and how rough. */
  label: string;
}

/** A unit vector, uniform over the sphere. */
function randomDirection(rand: () => number): [number, number, number] {
  const z = rand() * 2 - 1;
  const theta = rand() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(theta), r * Math.sin(theta), z];
}

/**
 * Sum one dominant lobe and a few smaller ones, at whatever depths fall out.
 *
 * Signed because a torn piece is not just dented — it has a bulge where it was
 * thick and a scoop where it came away, and mixing the signs is what stops every
 * fragment reading as the same lopsided egg. The overall depth is set afterwards
 * by `fragmentBias`, so this only decides the *character* of the shape: how many
 * lobes, where, which way each one goes, and which of them leads.
 */
function lobeSum(rand: () => number, grade: FragmentGrade): number[] {
  const lobes = grade.minLobes + Math.floor(rand() * (grade.maxLobes - grade.minLobes + 1));

  const bias = zeroShape();
  const lobe = new Array<number>(SH_COUNT);
  for (let i = 0; i < lobes; i++) {
    const [x, y, z] = randomDirection(rand);
    const size = i === 0 ? 1 : FRAGMENT_SATELLITE_DEPTH * (0.4 + rand() * 0.6);
    const depth = size * (rand() < grade.scoopChance ? 1 : -1);
    tiltedDentCoefficients(x, y, z, depth, FRAGMENT_BAND_TILT, lobe);
    addShapes(bias, lobe, bias);
  }
  return bias;
}

/**
 * A shape for `grade`, scaled so it actually *looks* as rough as the grade says.
 *
 * Scaled to measured roughness rather than to a coefficient norm because how
 * much of a norm shows depends entirely on how the lobes fell — and, before
 * `FRAGMENT_BAND_TILT`, on how much of it went into an l=1 term that shows not
 * at all. Aiming at the norm and hoping is what made the three options blur
 * together; aiming at what `shapeRoughness` measures makes "very lumpy" mean
 * one thing every time.
 *
 * A layout whose lobes partly cancel needs a norm past `BIAS_MAX` to reach its
 * band, and the cap is not negotiable — a fragment above it would be shrunk on
 * its first growth step and stop matching the preview. Such a layout is redrawn
 * rather than deepened; if none of the tries fit, the closest is capped and the
 * label, being measured, tells the truth about what came out.
 */
export function fragmentBias(rand: () => number, grade: FragmentGrade): number[] {
  const target = grade.minPeak + rand() * (grade.maxPeak - grade.minPeak);
  const limit = BIAS_MAX * DENT_UNIT_NORM;

  let closest: number[] | null = null;
  let closestMagnitude = Infinity;

  for (let attempt = 0; attempt < FRAGMENT_LAYOUT_TRIES; attempt++) {
    const bias = lobeSum(rand, grade);
    const roughness = shapeRoughness(bias);
    if (roughness <= 0) continue;

    const scale = target / roughness;
    for (let k = 0; k < SH_COUNT; k++) bias[k] *= scale;

    const magnitude = shapeMagnitude(bias);
    if (magnitude <= limit) return bias;
    if (magnitude < closestMagnitude) {
      closestMagnitude = magnitude;
      closest = bias;
    }
  }

  return capShape(closest ?? zeroShape(), BIAS_MAX);
}

/**
 * How rough it looks, in words.
 *
 * Boundaries fall midway between the grade bands rather than being written down
 * separately, so a fragment can never be labelled as a grade it was not drawn
 * as — the two would otherwise drift apart the first time a band is retuned.
 */
export function describeRoughness(peak: number): string {
  for (let i = 0; i < FRAGMENT_GRADES.length - 1; i++) {
    const boundary = (FRAGMENT_GRADES[i].maxPeak + FRAGMENT_GRADES[i + 1].minPeak) / 2;
    if (peak < boundary) return FRAGMENT_GRADES[i].word;
  }
  return FRAGMENT_GRADES[FRAGMENT_GRADES.length - 1].word;
}

export function makeFragment(rand: () => number, seed: number, grade = 0): FragmentStarter {
  const radiusMm =
    FRAGMENT_MIN_RADIUS_MM + rand() * (FRAGMENT_MAX_RADIUS_MM - FRAGMENT_MIN_RADIUS_MM);
  const bias = fragmentBias(rand, FRAGMENT_GRADES[grade]);

  // The tear itself. Set at the shape's flattest side rather than anywhere:
  // a piece comes away along the line it was weakest, and putting the face on
  // the side that is already scooped reads as one event instead of two.
  const facets: Facet[] = [];
  const tear = FRAGMENT_GRADES[grade].tornFace;
  if (tear > 0) {
    const [x, y, z] = extremeDirection(bias);
    const facing = deviationAt(bias, x, y, z) <= 0 ? 1 : -1;
    facets.push({ d: [x * facing, y * facing, z * facing], depth: tear });
  }

  // Measured, not assumed. The scaling above aims at a peak inside the grade's
  // band and normally hits it exactly, but a layout that had to be capped comes
  // out rounder than asked, and the label should say so.
  const roughness = describeRoughness(shapeRoughness(bias));
  const torn = facets.length > 0 ? ', flat where it came away' : '';
  return {
    seed,
    radiusMm,
    bias,
    facets,
    grade,
    label: `${(radiusMm * 2).toFixed(0)} mm across, ${roughness}${torn}`
  };
}

/**
 * One fragment per grade, roundest first.
 *
 * Each gets its own seed so the one you pick keeps the exact strand layout and
 * gravel you were shown, and so the set is reproducible from `masterSeed` when
 * a test wants the same three twice.
 */
export function makeFragments(masterSeed: number = randomSeed()): FragmentStarter[] {
  const rand = mulberry32(masterSeed);
  return FRAGMENT_GRADES.map((_, grade) =>
    // A fresh uint32 per fragment, drawn from the master stream.
    makeFragment(rand, Math.floor(rand() * 4294967296) >>> 0, grade)
  );
}

/**
 * A single fragment of no particular grade, for where there is nothing to
 * choose between — the ambient tank in the post, which is illustrating the
 * thing rather than handing anyone a pet.
 */
export function randomFragment(masterSeed: number = randomSeed()): FragmentStarter {
  const rand = mulberry32(masterSeed);
  const grade = Math.floor(rand() * FRAGMENT_GRADES.length);
  return makeFragment(rand, Math.floor(rand() * 4294967296) >>> 0, grade);
}

/** Hatch the chosen fragment into an actual marimo. */
export function marimoFromFragment(fragment: FragmentStarter, nowMs: number): MarimoState {
  const state = newMarimo(nowMs, fragment.seed);
  state.radiusMm = fragment.radiusMm;
  state.bias = fragment.bias.slice();
  state.facets = fragment.facets.map((facet) => ({
    d: [facet.d[0], facet.d[1], facet.d[2]] as Facet['d'],
    depth: facet.depth
  }));
  return state;
}
