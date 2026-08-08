import { describe, expect, it } from 'vitest';
import {
  ADAPTATION,
  DEFAULT_ROOM_TONE,
  KELVIN_MAX,
  KELVIN_MIN,
  LIGHT_SOURCES,
  REFERENCE_SOURCE_ID,
  ROOM_TONES,
  chromaticityToLinearRgb,
  levelScale,
  lightSourceById,
  lightSourceColour,
  planckianChromaticity,
  resolveLighting,
  roomToneById,
  sourceChromaticity,
  uvToXy,
  whiteBalance,
  xyToUv,
  type RoomToneId
} from './lighting';

const LUMA = [0.2126, 0.7152, 0.0722] as const;

function luminance(rgb: readonly [number, number, number]): number {
  return LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2];
}

describe('planckianChromaticity', () => {
  it('lands on the published chromaticities of the standard illuminants', () => {
    // Illuminant A is a 2856 K tungsten lamp, defined at (0.4476, 0.4074), and
    // the 6500 K point of the locus sits near (0.3135, 0.3237). A thousandth is
    // as much as a cubic fit to the locus promises, and is well under a just
    // noticeable difference.
    const a = planckianChromaticity(2856);
    expect(Math.abs(a[0] - 0.4476)).toBeLessThan(0.001);
    expect(Math.abs(a[1] - 0.4074)).toBeLessThan(0.001);

    const d65 = planckianChromaticity(6500);
    expect(Math.abs(d65[0] - 0.3135)).toBeLessThan(0.001);
    expect(Math.abs(d65[1] - 0.3237)).toBeLessThan(0.001);
  });

  it('gets warmer monotonically as the temperature falls', () => {
    let previous = -Infinity;
    for (let k = 20000; k >= 2000; k -= 500) {
      const [x] = planckianChromaticity(k);
      expect(x).toBeGreaterThan(previous);
      previous = x;
    }
  });

  it('clamps outside the range the fit is valid over', () => {
    expect(planckianChromaticity(500)).toEqual(planckianChromaticity(KELVIN_MIN));
    expect(planckianChromaticity(1e6)).toEqual(planckianChromaticity(KELVIN_MAX));
  });
});

describe('xyToUv', () => {
  it('round-trips', () => {
    for (const kelvin of [2000, 4000, 6500, 12000]) {
      const xy = planckianChromaticity(kelvin);
      const back = uvToXy(xyToUv(xy));
      expect(back[0]).toBeCloseTo(xy[0], 9);
      expect(back[1]).toBeCloseTo(xy[1], 9);
    }
  });
});

describe('sourceChromaticity', () => {
  it('is the locus itself when the tint is zero', () => {
    expect(sourceChromaticity(3000, 0)).toEqual(planckianChromaticity(3000));
  });

  it('steps the stated distance, perpendicular to the locus', () => {
    const duv = 0.012;
    const on = xyToUv(planckianChromaticity(4000));
    const off = xyToUv(sourceChromaticity(4000, duv));
    expect(Math.hypot(off[0] - on[0], off[1] - on[1])).toBeCloseTo(duv, 5);
  });

  it('puts positive tint on the green side and negative on the magenta side', () => {
    // The sign is the one thing here that is easy to get backwards and hard to
    // notice: swapped, the fluorescent tube goes magenta and the aquarium light
    // goes green, and both still look like plausible lighting.
    const green = chromaticityToLinearRgb(sourceChromaticity(4000, 0.02));
    const magenta = chromaticityToLinearRgb(sourceChromaticity(4000, -0.02));
    expect(green[1]).toBeGreaterThan(magenta[1]);
    expect(green[0] + green[2]).toBeLessThan(magenta[0] + magenta[2]);
  });
});

describe('chromaticityToLinearRgb', () => {
  it('returns unit luminance, so colour and brightness stay separate controls', () => {
    for (let k = KELVIN_MIN; k <= KELVIN_MAX; k += 1000) {
      expect(luminance(chromaticityToLinearRgb(planckianChromaticity(k)))).toBeCloseTo(1, 6);
    }
  });

  it('keeps every channel positive where the colour is outside the gamut', () => {
    // A candle is a more saturated orange than sRGB can make. Clamping at zero
    // would leave a light with no blue at all, and the tank would lose a
    // dimension of colour rather than gain a warm one.
    const candle = chromaticityToLinearRgb(planckianChromaticity(1800));
    expect(Math.min(...candle)).toBeGreaterThan(0.05);
    // Still unmistakably orange, though.
    expect(candle[0]).toBeGreaterThan(candle[2] * 8);
  });

  it('orders the presets from warm to cool without exception', () => {
    const ratios = LIGHT_SOURCES.map((source) => {
      const [r, , b] = lightSourceColour(source);
      return { id: source.id, kelvin: source.kelvin, warmth: r / b };
    });
    const byKelvin = [...ratios].sort((a, b) => a.kelvin - b.kelvin);
    const byWarmth = [...ratios].sort((a, b) => b.warmth - a.warmth);
    expect(byWarmth.map((s) => s.id)).toEqual(byKelvin.map((s) => s.id));
  });
});

describe('whiteBalance', () => {
  it('is exactly one for the bulb the scene was authored under', () => {
    // Not approximately: this is the promise that a visitor who never opens the
    // menu sees the tank the way it was tuned, pixel for pixel.
    expect(whiteBalance(REFERENCE_SOURCE_ID)).toEqual([1, 1, 1]);
  });

  it('matches the reference bulb to the lamp colour in the shader', () => {
    // `waterShader` authors the lamp as (1.0, 0.96, 0.88). If the reference
    // preset drifts far from that, every other bulb is a ratio against the
    // wrong white and the whole set is quietly tinted. The preset's kelvin and
    // tint are rounded off the fit, so a couple of percent is expected; a tenth
    // would mean the label had stopped describing the lamp.
    const authored: [number, number, number] = [1.0, 0.96, 0.88];
    const y = luminance(authored);
    const reference = lightSourceColour(lightSourceById(REFERENCE_SOURCE_ID));
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(reference[i] - authored[i] / y)).toBeLessThan(0.02);
    }
  });

  it('warms the image for a warm bulb and cools it for a cool one', () => {
    const candle = whiteBalance('candle');
    expect(candle[0]).toBeGreaterThan(1);
    expect(candle[2]).toBeLessThan(1);

    const aquarium = whiteBalance('aquarium');
    expect(aquarium[2]).toBeGreaterThan(1);
  });

  it('softens the shift rather than applying it whole', () => {
    // The screen is not the room the visitor is sitting in, so their eye never
    // adapts to the bulb the way it would in life. `ADAPTATION` is the amount
    // of that missing adaptation the render gives back.
    const softened = whiteBalance('candle');
    const source = lightSourceColour(lightSourceById('candle'));
    const reference = lightSourceColour(lightSourceById(REFERENCE_SOURCE_ID));
    const whole = source[0] / reference[0];
    expect(ADAPTATION).toBeLessThan(1);
    expect(softened[0]).toBeLessThan(whole);
    expect(softened[0]).toBeGreaterThan(1);
  });

  it('leaves nothing black, however far the bulb is from the reference', () => {
    for (const source of LIGHT_SOURCES) {
      expect(Math.min(...whiteBalance(source.id))).toBeGreaterThan(0.05);
    }
  });
});

describe('levelScale', () => {
  it('is one at normal, and a modest step either side', () => {
    expect(levelScale('normal')).toBe(1);
    expect(levelScale('dim')).toBeGreaterThan(0.5);
    expect(levelScale('dim')).toBeLessThan(1);
    expect(levelScale('bright')).toBeGreaterThan(1);
    expect(levelScale('bright')).toBeLessThan(2);
  });
});

describe('roomToneById', () => {
  it('gives every tone a distinct backdrop', () => {
    const backdrops = new Set(ROOM_TONES.map((tone) => tone.backdrop));
    expect(backdrops.size).toBe(ROOM_TONES.length);
    for (const tone of ROOM_TONES) {
      expect(tone.backdrop).toMatch(/^#[0-9a-f]{6}$/);
      expect(roomToneById(tone.id)).toBe(tone);
    }
  });

  it('falls back rather than returning undefined', () => {
    expect(roomToneById('lamplit' as RoomToneId)).toBe(roomToneById(DEFAULT_ROOM_TONE));
  });
});

describe('resolveLighting', () => {
  it('is the identity for the defaults', () => {
    const resolved = resolveLighting({
      lightSource: REFERENCE_SOURCE_ID,
      lightLevel: 'normal',
      roomTone: DEFAULT_ROOM_TONE
    });
    expect(resolved).toEqual({ balance: [1, 1, 1], level: 1, tone: 'dark' });
  });

  it('keeps the three axes independent', () => {
    const dim = resolveLighting({ lightSource: 'candle', lightLevel: 'dim', roomTone: 'cream' });
    const bright = resolveLighting({
      lightSource: 'candle',
      lightLevel: 'bright',
      roomTone: 'dark'
    });
    // The bulb decides the balance, the dimmer decides the level, and neither
    // is disturbed by the walls being painted.
    expect(dim.balance).toEqual(bright.balance);
    expect(dim.level).toBeLessThan(bright.level);
    expect(dim.tone).toBe('cream');
    expect(bright.tone).toBe('dark');
  });
});
