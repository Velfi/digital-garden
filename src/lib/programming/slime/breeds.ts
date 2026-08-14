/**
 * The breeder's catalogue. A breed is what the slime *is* — chosen once when
 * the order is placed and stamped into the pet (`SlimeState.breed`), unlike a
 * colourway in `settings.ts`, which is a viewing preference the visitor may
 * repaint at any time. Today every breed wears one colourway plainly; the
 * `pattern` field is the seam where exotic strains (stripes, gradients) will
 * grow, as a per-fragment blend in `volumeMaterial.ts` keyed off the same
 * body-local coordinate the mica streaks use.
 */

import { COLORWAYS, type ColorwayId } from './settings';

/** How the breed's colour sits in the body. Exotics will add members. */
export type BreedPattern = 'solid';

export interface SlimeBreed {
  id: string;
  label: string;
  /** The colourway this breed wears; drives the whole existing tint path. */
  colorway: ColorwayId;
  pattern: BreedPattern;
  /** A flat colour for pickers and paperwork — the jelly itself is shaded live. */
  swatch: string;
  hint: string;
}

export const BREEDS = [
  {
    id: 'seaglass-common',
    label: 'Seaglass Common',
    colorway: 'seaglass',
    pattern: 'solid',
    swatch: '#7fd0b4',
    hint: 'The original strain. Most slimes are this one, and proud of it.'
  },
  {
    id: 'bottleglass',
    label: 'Bottleglass',
    colorway: 'sky',
    pattern: 'solid',
    swatch: '#85c3e3',
    hint: 'Pale blue, like the sea got into the bottle for once.'
  },
  {
    id: 'thistledown',
    label: 'Thistledown',
    colorway: 'lilac',
    pattern: 'solid',
    swatch: '#b1a0e0',
    hint: 'A cool, washed violet. Calm in the hand.'
  },
  {
    id: 'rosewash',
    label: 'Rosewash',
    colorway: 'rose',
    pattern: 'solid',
    swatch: '#e39cb8',
    hint: 'Pink jelly, faintly warm, allegedly sweeter-tempered.'
  },
  {
    id: 'amberling',
    label: 'Amberling',
    colorway: 'honey',
    pattern: 'solid',
    swatch: '#ddb877',
    hint: 'Honey-amber, always leaning toward the light.'
  }
] as const satisfies readonly SlimeBreed[];

export type BreedId = (typeof BREEDS)[number]['id'];

// Off the catalogue, not restated — a breed dropped from the register stops
// validating on the same edit (the settings module's reasoning).
export const BREED_IDS: readonly BreedId[] = BREEDS.map((b) => b.id);

export function breedById(id: BreedId): (typeof BREEDS)[number] {
  return BREEDS.find((b) => b.id === id) ?? BREEDS[0];
}

/** The breeder's choice — for the "surprise me" order. */
export function randomBreed(random: () => number = Math.random): (typeof BREEDS)[number] {
  return BREEDS[Math.min(BREEDS.length - 1, Math.floor(random() * BREEDS.length))];
}
