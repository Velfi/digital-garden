/**
 * Viewing preferences for the tank. Not part of the pet.
 *
 * Deliberately separate from `persist.ts`, in both storage key and failure
 * policy. A corrupt *pet* is unrecoverable, so that module throws the whole
 * thing away and hatches a new one. A corrupt *setting* is not: every field
 * falls back on its own, so one unrecognised value cannot cost you the rest of
 * your preferences. Restarting the pet must never be a side effect of reading a
 * preference file, and keeping the two apart is what guarantees it.
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
} from './lighting';

/** Whether to damp the motion, or take the answer from the operating system. */
export type MotionPreference = 'auto' | 'reduced' | 'full';

/** Strand count. `reduced` is the lighter coat the embedded tank always uses. */
export type DetailPreference = 'full' | 'reduced';

export interface MarimoSettings {
  motion: MotionPreference;
  detail: DetailPreference;
  showFps: boolean;
  /** How far up the lamp above the jar is turned. */
  lightLevel: LightLevel;
  /** Which bulb is in it. See `lighting.ts`. */
  lightSource: LightSourceId;
  /** Whether the room around the jar is unlit or cream. See `lighting.ts`. */
  roomTone: RoomToneId;
}

export const MARIMO_SETTINGS_KEY = 'marimo-settings-v1';

export const DEFAULT_SETTINGS: Readonly<MarimoSettings> = Object.freeze({
  motion: 'auto',
  detail: 'full',
  showFps: true,
  lightLevel: DEFAULT_LIGHT_LEVEL,
  lightSource: DEFAULT_LIGHT_SOURCE_ID,
  roomTone: DEFAULT_ROOM_TONE
});

const MOTION_VALUES: readonly MotionPreference[] = ['auto', 'reduced', 'full'];
const DETAIL_VALUES: readonly DetailPreference[] = ['full', 'reduced'];
const LEVEL_VALUES: readonly LightLevel[] = ['dim', 'normal', 'bright'];
// Read off the catalogue rather than written out again: a bulb that is dropped
// from the menu stops validating on the same edit, instead of lingering here as
// a value nothing can display.
const SOURCE_VALUES: readonly LightSourceId[] = LIGHT_SOURCES.map((source) => source.id);
const TONE_VALUES: readonly RoomToneId[] = ROOM_TONES.map((tone) => tone.id);

/** Per-field validation, falling back to the default for anything unrecognised. */
export function validateSettings(raw: unknown): MarimoSettings {
  const settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return settings;
  const s = raw as Record<string, unknown>;

  if (MOTION_VALUES.includes(s.motion as MotionPreference)) {
    settings.motion = s.motion as MotionPreference;
  }
  if (DETAIL_VALUES.includes(s.detail as DetailPreference)) {
    settings.detail = s.detail as DetailPreference;
  }
  if (typeof s.showFps === 'boolean') {
    settings.showFps = s.showFps;
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

  return settings;
}

/** Reads the stored preferences, or the defaults. Never throws. */
export function loadSettings(): MarimoSettings {
  if (!browser) return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(MARIMO_SETTINGS_KEY);
    return validateSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Writes immediately — these change on a click, not sixty times a second. */
export function saveSettings(settings: MarimoSettings): void {
  if (!browser) return;
  try {
    localStorage.setItem(MARIMO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* quota or private browsing — the choice holds for this session */
  }
}

/**
 * Whether to damp the motion, given the preference and what the system asks for.
 *
 * `auto` is the default because a visitor who has asked their OS to reduce
 * motion has already answered this question, and should not have to answer it
 * again here. The explicit settings exist so that answer can be overridden in
 * either direction — including turning damping *on* without touching a system
 * setting, which is the case a bare media query cannot serve.
 */
export function resolveReducedMotion(
  settings: Pick<MarimoSettings, 'motion'>,
  systemPrefersReduced: boolean
): boolean {
  if (settings.motion === 'reduced') return true;
  if (settings.motion === 'full') return false;
  return systemPrefersReduced;
}
