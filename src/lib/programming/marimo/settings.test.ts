import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  resolveReducedMotion,
  validateSettings,
  type MarimoSettings
} from './settings';

describe('validateSettings', () => {
  it('returns the defaults for anything that is not an object', () => {
    for (const junk of [null, undefined, 42, 'nope', true]) {
      expect(validateSettings(junk)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('round-trips a well-formed object', () => {
    const settings: MarimoSettings = {
      motion: 'reduced',
      detail: 'reduced',
      showFps: false,
      lightLevel: 'dim',
      lightSource: 'candle',
      roomTone: 'cream'
    };
    expect(validateSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });

  it('leaves the lights off for a preference file written before the switch existed', () => {
    // Every stored setting predates `roomTone`, so this is the case every
    // returning visitor hits exactly once: the room they left is the dark one.
    const result = validateSettings({ lightSource: 'candle', lightLevel: 'bright' });
    expect(result.roomTone).toBe('dark');
  });

  it('defaults a bulb it has never heard of, and keeps the level beside it', () => {
    // The case a stored preference actually hits: a bulb dropped from the
    // catalogue between one visit and the next.
    const result = validateSettings({ lightSource: 'gaslight', lightLevel: 'bright' });
    expect(result.lightSource).toBe(DEFAULT_SETTINGS.lightSource);
    expect(result.lightLevel).toBe('bright');
  });

  it('keeps the fields it recognises and defaults only the ones it does not', () => {
    // The whole reason settings validate per field: one bad value must not cost
    // you the preferences either side of it.
    const result = validateSettings({ motion: 'sideways', detail: 'reduced', showFps: false });
    expect(result.motion).toBe(DEFAULT_SETTINGS.motion);
    expect(result.detail).toBe('reduced');
    expect(result.showFps).toBe(false);
  });

  it('rejects values of the wrong type rather than coercing them', () => {
    const result = validateSettings({ motion: 3, detail: null, showFps: 'yes' });
    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores unknown keys', () => {
    const result = validateSettings({ motion: 'full', wateringCan: true });
    expect(result.motion).toBe('full');
    expect(result).not.toHaveProperty('wateringCan');
  });

  it('never returns the shared default object', () => {
    // It is handed straight to `$state` and mutated by the options modal.
    const result = validateSettings(null);
    expect(result).not.toBe(DEFAULT_SETTINGS);
    result.showFps = !result.showFps;
    expect(DEFAULT_SETTINGS.showFps).toBe(true);
  });
});

describe('resolveReducedMotion', () => {
  it('follows the system when set to auto', () => {
    expect(resolveReducedMotion({ motion: 'auto' }, true)).toBe(true);
    expect(resolveReducedMotion({ motion: 'auto' }, false)).toBe(false);
  });

  it('overrides the system in both directions', () => {
    // Turning damping *on* without a system setting is the case a bare media
    // query cannot serve, and the reason this is three-valued and not a boolean.
    expect(resolveReducedMotion({ motion: 'reduced' }, false)).toBe(true);
    expect(resolveReducedMotion({ motion: 'full' }, true)).toBe(false);
  });
});
