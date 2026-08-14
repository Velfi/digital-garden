/**
 * Viewing preferences for the terrarium. Not part of the pet.
 *
 * Deliberately separate from `persist.ts`, in both storage key and failure
 * policy, on the marimo's reasoning: a corrupt *pet* is unrecoverable and gets
 * replaced whole, but a corrupt *setting* falls back field by field — and
 * re-shipping the pet must never be a side effect of reading a preference
 * file.
 */

import { browser } from '$app/environment';
import {
  DEFAULT_LIGHT_LEVEL,
  DEFAULT_LIGHT_SOURCE_ID,
  DEFAULT_ROOM_TONE,
  LIGHT_SOURCES,
  ROOM_TONES,
  type LightLevel,
  type LightSourceId,
  type RoomToneId
} from '../marimo/lighting';

/** Whether to damp the motion, or take the answer from the operating system. */
export type MotionPreference = 'auto' | 'reduced' | 'full';

/**
 * The body's finish — the four archetypes from the shader research, as
 * multipliers on the volume material's scatter, absorption and gloss.
 * `jelly` is the stock sea-glass look the rest of the shading was tuned on.
 */
export type SlimeFinish = 'jelly' | 'glassy' | 'milky' | 'matte';

/**
 * Named colourways: hue rotations away from the stock sea-glass, applied
 * through the same grade the debug sliders use (the slider then reads as
 * degrees away from the *chosen* colour, not from sea-glass).
 */
export const COLORWAYS = [
  { id: 'seaglass', label: 'Sea-glass', hue: 0, hint: 'The colour it shipped in.' },
  { id: 'sky', label: 'Sky', hue: 40, hint: 'Pale blue, like bottle glass.' },
  { id: 'lilac', label: 'Lilac', hue: 110, hint: 'A cool, washed violet.' },
  { id: 'rose', label: 'Rose', hue: 170, hint: 'Pink jelly, faintly warm.' },
  { id: 'honey', label: 'Honey', hue: -115, hint: 'Amber, toward the light.' }
] as const;

export type ColorwayId = (typeof COLORWAYS)[number]['id'];

/** Hue composition helper: colourway base + debug offset, wrapped to ±180. */
export function effectiveHue(settings: Pick<SlimeSettings, 'colorway' | 'hue'>): number {
  const base = COLORWAYS.find((c) => c.id === settings.colorway)?.hue ?? 0;
  const sum = base + settings.hue;
  return ((((sum + 180) % 360) + 360) % 360) - 180;
}

export interface SlimeSettings {
  motion: MotionPreference;
  /** How far up the lamp over the box is turned. The marimo's control. */
  lightLevel: LightLevel;
  /** Which bulb is in it — the marimo's catalogue, shared outright. */
  lightSource: LightSourceId;
  /** Unlit room or cream walls. See the marimo's `lighting.ts`. */
  roomTone: RoomToneId;
  /** XSPH viscosity multiplier, 1 = stock goo. */
  viscosity: number;
  /** Density-pressure multiplier, 1 = stock plumpness. */
  pressure: number;
  /** Shape-matching-drive multiplier, 1 = stock; 0 = no orb memory, a puddle. */
  shape: number;
  /** Flake size, 0 fine dust .. 1 coarse glitter. */
  micaSize: number;
  /** Flake amount, 0 a few stray specks .. 1 a dense suspension. */
  micaAmount: number;
  /** Which of the four material archetypes the body wears. */
  finish: SlimeFinish;
  /** Which named colourway the body's tint starts from. */
  colorway: ColorwayId;
  /** Debug hue shift on the body's tint, degrees -180..180, 0 = stock. */
  hue: number;
  /** Debug saturation on the body's tint, 0 grey .. 2 lurid, 1 = stock. */
  saturation: number;
  /** Debug lightness on the body's tint, 0 dark .. 2 washed, 1 = stock. */
  lightness: number;
  /** Debug mode: sim controls move under the tank, plus a force-emerge button. */
  debug: boolean;
}

/** Hue-shift slider bounds, degrees either side of the stock sea-glass. */
export const HUE_MIN = -180;
export const HUE_MAX = 180;

/** Saturation / lightness slider bounds, multipliers on the stock tint. */
export const GRADE_MIN = 0;
export const GRADE_MAX = 2;

/** Slider bounds. 0 turns a term off entirely (watery / limp / puddle);
 * past ~3 the per-pair exchange overshoots and the sim stops looking like
 * material. */
export const TUNING_MIN = 0;
export const TUNING_MAX = 3;

export const SLIME_SETTINGS_KEY = 'slime-settings-v1';

export const DEFAULT_SETTINGS: Readonly<SlimeSettings> = Object.freeze({
  motion: 'auto',
  lightLevel: DEFAULT_LIGHT_LEVEL,
  lightSource: DEFAULT_LIGHT_SOURCE_ID,
  roomTone: DEFAULT_ROOM_TONE,
  viscosity: 1,
  pressure: 1,
  shape: 1,
  micaSize: 0.5,
  micaAmount: 0.5,
  finish: 'jelly',
  colorway: 'seaglass',
  hue: 0,
  saturation: 1.5,
  lightness: 1,
  debug: false
});

const MOTION_VALUES: readonly MotionPreference[] = ['auto', 'reduced', 'full'];
const FINISH_VALUES: readonly SlimeFinish[] = ['jelly', 'glassy', 'milky', 'matte'];
// Off the catalogue, not restated — a colourway dropped from the menu stops
// validating on the same edit.
const COLORWAY_VALUES: readonly ColorwayId[] = COLORWAYS.map((c) => c.id);
const LEVEL_VALUES: readonly LightLevel[] = ['dim', 'normal', 'bright'];
// Off the catalogues, not restated — a bulb dropped from the menu stops
// validating on the same edit (the marimo settings module's reasoning).
const SOURCE_VALUES: readonly LightSourceId[] = LIGHT_SOURCES.map((source) => source.id);
const TONE_VALUES: readonly RoomToneId[] = ROOM_TONES.map((tone) => tone.id);

/** Per-field validation, falling back to the default for anything unrecognised. */
export function validateSettings(raw: unknown): SlimeSettings {
  const settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return settings;
  const s = raw as Record<string, unknown>;

  if (MOTION_VALUES.includes(s.motion as MotionPreference)) {
    settings.motion = s.motion as MotionPreference;
  }
  if (LEVEL_VALUES.includes(s.lightLevel as LightLevel)) {
    settings.lightLevel = s.lightLevel as LightLevel;
  }
  if (SOURCE_VALUES.includes(s.lightSource as LightSourceId)) {
    settings.lightSource = s.lightSource as LightSourceId;
  }
  if (TONE_VALUES.includes(s.roomTone as RoomToneId)) {
    settings.roomTone = s.roomTone as RoomToneId;
  }

  if (typeof s.viscosity === 'number' && Number.isFinite(s.viscosity)) {
    settings.viscosity = Math.min(TUNING_MAX, Math.max(TUNING_MIN, s.viscosity));
  }
  if (typeof s.pressure === 'number' && Number.isFinite(s.pressure)) {
    settings.pressure = Math.min(TUNING_MAX, Math.max(TUNING_MIN, s.pressure));
  }
  if (typeof s.shape === 'number' && Number.isFinite(s.shape)) {
    settings.shape = Math.min(TUNING_MAX, Math.max(TUNING_MIN, s.shape));
  }
  if (typeof s.micaSize === 'number' && Number.isFinite(s.micaSize)) {
    settings.micaSize = Math.min(1, Math.max(0, s.micaSize));
  }
  if (typeof s.micaAmount === 'number' && Number.isFinite(s.micaAmount)) {
    settings.micaAmount = Math.min(1, Math.max(0, s.micaAmount));
  }
  if (FINISH_VALUES.includes(s.finish as SlimeFinish)) {
    settings.finish = s.finish as SlimeFinish;
  }
  if (COLORWAY_VALUES.includes(s.colorway as ColorwayId)) {
    settings.colorway = s.colorway as ColorwayId;
  }
  if (typeof s.hue === 'number' && Number.isFinite(s.hue)) {
    settings.hue = Math.min(HUE_MAX, Math.max(HUE_MIN, s.hue));
  }
  if (typeof s.saturation === 'number' && Number.isFinite(s.saturation)) {
    settings.saturation = Math.min(GRADE_MAX, Math.max(GRADE_MIN, s.saturation));
  }
  if (typeof s.lightness === 'number' && Number.isFinite(s.lightness)) {
    settings.lightness = Math.min(GRADE_MAX, Math.max(GRADE_MIN, s.lightness));
  }
  if (typeof s.debug === 'boolean') {
    settings.debug = s.debug;
  }

  return settings;
}

/** Reads the stored preferences, or the defaults. Never throws. */
export function loadSettings(): SlimeSettings {
  if (!browser) return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SLIME_SETTINGS_KEY);
    return validateSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Writes immediately — these change on a click, not sixty times a second. */
export function saveSettings(settings: SlimeSettings): void {
  if (!browser) return;
  try {
    localStorage.setItem(SLIME_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* quota or private browsing — the choice holds for this session */
  }
}

/**
 * Whether to damp the motion, given the preference and what the system asks
 * for. `auto` defers to the OS; the explicit values override it in either
 * direction. Same contract as the marimo's.
 */
export function resolveReducedMotion(
  settings: Pick<SlimeSettings, 'motion'>,
  systemPrefersReduced: boolean
): boolean {
  if (settings.motion === 'reduced') return true;
  if (settings.motion === 'full') return false;
  return systemPrefersReduced;
}
