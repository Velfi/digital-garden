import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, effectiveHue, validateSettings } from './settings';

describe('validateSettings', () => {
  it('round-trips a chosen finish', () => {
    expect(validateSettings({ finish: 'milky' }).finish).toBe('milky');
    expect(validateSettings({ finish: 'matte' }).finish).toBe('matte');
  });

  it('falls back to the stock finish for junk', () => {
    expect(validateSettings({ finish: 'chrome' }).finish).toBe(DEFAULT_SETTINGS.finish);
    expect(validateSettings({ finish: 7 }).finish).toBe('jelly');
    expect(validateSettings(null).finish).toBe('jelly');
  });

  it('recovers other fields alongside a bad finish', () => {
    const settings = validateSettings({ finish: 'nope', micaSize: 0.8 });
    expect(settings.finish).toBe('jelly');
    expect(settings.micaSize).toBe(0.8);
  });

  it('round-trips a colourway and rejects junk', () => {
    expect(validateSettings({ colorway: 'rose' }).colorway).toBe('rose');
    expect(validateSettings({ colorway: 'plaid' }).colorway).toBe('seaglass');
  });
});

describe('effectiveHue', () => {
  it('is the colourway base plus the debug offset', () => {
    expect(effectiveHue({ colorway: 'seaglass', hue: 0 })).toBe(0);
    expect(effectiveHue({ colorway: 'sky', hue: 20 })).toBe(60);
    expect(effectiveHue({ colorway: 'honey', hue: 0 })).toBe(-115);
  });

  it('wraps past the rim instead of clamping', () => {
    // rose (170) plus a big offset comes back around the circle, so the
    // scene's ±180 clamp never flattens a legal combination.
    expect(effectiveHue({ colorway: 'rose', hue: 120 })).toBe(-70);
    expect(effectiveHue({ colorway: 'honey', hue: -120 })).toBe(125);
  });
});
