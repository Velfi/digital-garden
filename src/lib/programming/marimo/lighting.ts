/**
 * What the lamp above the jar is, and how bright it is turned up.
 *
 * The scene has exactly one source. Every lit thing in it — the key on the
 * coat, the bounce off the pedestal, the haze in the water, the ceiling above —
 * is that lamp arriving by some route, which is what makes the whole room
 * re-colourable from a single chromaticity: swap the bulb and everything the
 * bulb touches has to move with it, or the tank stops agreeing with itself.
 *
 * So this module answers two questions and nothing else:
 *
 *   - what colour is the light, relative to the bulb the palette was authored
 *     under (`whiteBalance`);
 *   - how far up is it turned (`levelScale`).
 *
 * The first is deliberately a *ratio* rather than an absolute colour. Every
 * radiance constant in `waterShader.ts` was picked by eye against the original
 * warm-white lamp, and those choices are worth keeping: the gravel is that
 * brown, the haze is that green, because someone looked at them. Dividing the
 * new bulb by the old one and scaling the authored values by the result is a
 * von Kries adaptation — the same thing a camera does when you tell it the
 * white point — and it has the property that matters most here, which is that
 * the default preset comes out as exactly 1.0 and changes nothing at all.
 */

/** How far up the lamp is turned. Three steps, because this is a bulb, not a rig. */
export type LightLevel = 'dim' | 'normal' | 'bright';

/**
 * What the room around the jar is painted.
 *
 * A third axis, and genuinely independent of the other two: the bulb decides
 * what colour the light is and the level decides how much of it there is, but
 * neither says anything about what happens to the light *after* it has left the
 * lamp. In a black room it leaves once and never comes back; in a cream one it
 * bounces off every wall in the place and arrives at the jar again from all
 * sides. That is a different photograph of the same lamp.
 *
 * It is one setting rather than a wall colour and a fill slider because the two
 * are not free to disagree — a bright backdrop with no bounce on the subject is
 * a composite, not a room. `waterShader.ts` holds the radiances each tone
 * implies, and moves all of them together.
 */
export type RoomToneId = 'dark' | 'cream';

export interface RoomTone {
  id: RoomToneId;
  label: string;
  /**
   * The flat colour the room settles at, as CSS.
   *
   * Not used to render anything in the scene — the backdrop shell computes its
   * own radiance per pixel. This is the colour *underneath* it: the canvas
   * clear, the panel the canvas sits in before the first frame lands, and the
   * letterbox in fullscreen. It has to be near enough to what the shader paints
   * that a slow first frame does not flash.
   */
  backdrop: string;
  /** One line for the options modal. */
  hint: string;
}

export const ROOM_TONES: readonly RoomTone[] = Object.freeze([
  {
    id: 'dark',
    label: 'Lights off',
    backdrop: '#05080a',
    hint: 'An unlit room, one lamp above the jar, and nothing else in shot'
  },
  {
    id: 'cream',
    label: 'Lights on',
    backdrop: '#ded7c9',
    hint: 'Warm cream walls. The same lamp, arriving back off every one of them'
  }
]);

export const DEFAULT_ROOM_TONE: RoomToneId = 'dark';

export function roomToneById(id: RoomToneId): RoomTone {
  return ROOM_TONES.find((tone) => tone.id === id) ?? ROOM_TONES[0];
}

export type LightSourceId =
  | 'candle'
  | 'tungsten'
  | 'warm-led'
  | 'fluorescent'
  | 'desk-lamp'
  | 'daylight'
  | 'aquarium';

export interface LightSource {
  id: LightSourceId;
  label: string;
  /** Correlated colour temperature in kelvin — the white balance axis. */
  kelvin: number;
  /**
   * Distance off the Planckian locus in CIE 1960 uv — the green/magenta axis.
   *
   * Positive is above the locus and reads green; negative is below it and reads
   * magenta. A blackbody has none of it by definition, which is why a candle
   * and a tungsten bulb sit at zero and everything with a phosphor in it does
   * not: fluorescent tubes are notoriously green, and the blue-and-red diodes
   * in an aquarium light leave a dip through the middle of the spectrum that
   * the eye reads as violet.
   */
  duv: number;
  /** One line for the options modal. */
  hint: string;
}

/**
 * The bulbs on offer, warmest first.
 *
 * Chosen to span the two axes rather than to be exhaustive — a candle and
 * daylight are four thousand kelvin apart, and the fluorescent tube and the
 * aquarium light sit either side of the locus, so between them the four corners
 * of the space are all reachable.
 */
export const LIGHT_SOURCES: readonly LightSource[] = Object.freeze([
  { id: 'candle', label: 'Candle', kelvin: 1850, duv: 0, hint: 'Firelight, and almost no blue' },
  {
    id: 'tungsten',
    label: 'Tungsten bulb',
    kelvin: 2700,
    duv: 0,
    hint: 'An old filament lamp, on the blackbody curve'
  },
  {
    id: 'warm-led',
    label: 'Warm LED',
    kelvin: 3000,
    duv: 0.004,
    hint: 'Domestic warm white, a shade green off the curve'
  },
  {
    id: 'fluorescent',
    label: 'Fluorescent tube',
    kelvin: 4200,
    duv: 0.013,
    hint: 'Office lighting: neutral, and unmistakably green'
  },
  {
    // Not chosen: measured. This is the chromaticity that best fits the lamp
    // colour the scene was authored with — 6020 K and 0.0035 above the locus,
    // rounded — which is why it is also the reference every other bulb here is
    // a ratio against, and why picking it leaves the tank exactly as it was.
    id: 'desk-lamp',
    label: 'Desk lamp',
    kelvin: 6000,
    duv: 0.003,
    hint: 'Cool white LED. The lamp the jar has always been lit by'
  },
  {
    id: 'daylight',
    label: 'Daylight',
    kelvin: 6900,
    duv: 0.003,
    hint: 'A window on an overcast afternoon'
  },
  {
    id: 'aquarium',
    label: 'Aquarium LED',
    kelvin: 9000,
    duv: -0.014,
    hint: 'Blue-and-red diodes: cold, and violet off the curve'
  }
]);

/**
 * The bulb every radiance constant in the scene was authored under.
 *
 * Not an arbitrary choice of default: `whiteBalance` divides by this one, so
 * whichever source is named here is the source that leaves the tank pixel for
 * pixel as it was. Moving it means re-tuning the palette.
 */
export const REFERENCE_SOURCE_ID: LightSourceId = 'desk-lamp';

export const DEFAULT_LIGHT_SOURCE_ID: LightSourceId = REFERENCE_SOURCE_ID;
export const DEFAULT_LIGHT_LEVEL: LightLevel = 'normal';

/**
 * Multipliers on the exposure.
 *
 * A quarter of a stop either side, near enough. The jar is the only lit thing
 * in a dark room and the whole image is that one lamp, so this really is a
 * dimmer: turning it down does not merely darken the picture, it darkens the
 * source and everything downstream of it in exactly the same proportion, which
 * is why one multiply at the end of every shader is the honest implementation
 * and not a shortcut.
 *
 * The range is small on purpose. Past about a stop down the marimo stops being
 * legible against the water, and past a stop up the specular pip on the glass
 * takes over the frame.
 */
const LEVEL_SCALE: Readonly<Record<LightLevel, number>> = Object.freeze({
  dim: 0.72,
  normal: 1,
  bright: 1.36
});

export function levelScale(level: LightLevel): number {
  return LEVEL_SCALE[level] ?? LEVEL_SCALE.normal;
}

/** Resolved once: the ids are a closed union, so this cannot miss. */
const REFERENCE_SOURCE = LIGHT_SOURCES.find(
  (source) => source.id === REFERENCE_SOURCE_ID
) as LightSource;

export function lightSourceById(id: LightSourceId): LightSource {
  return LIGHT_SOURCES.find((source) => source.id === id) ?? REFERENCE_SOURCE;
}

// --- the Planckian locus ----------------------------------------------------

/** The range Kim's approximation to the locus is valid over. */
export const KELVIN_MIN = 1667;
export const KELVIN_MAX = 25000;

/**
 * Chromaticity of a blackbody at `kelvin`, as CIE 1931 xy.
 *
 * Kim et al.'s cubic fit to the locus. The alternative is integrating Planck's
 * law against the colour matching functions, which is the same answer to four
 * decimal places for a great deal more arithmetic, and this runs when someone
 * picks a bulb from a menu.
 */
export function planckianChromaticity(kelvin: number): [number, number] {
  const t = Math.min(KELVIN_MAX, Math.max(KELVIN_MIN, kelvin));
  const t2 = t * t;
  const t3 = t2 * t;

  const x =
    t <= 4000
      ? -0.2661239e9 / t3 - 0.2343589e6 / t2 + 0.8776956e3 / t + 0.17991
      : -3.0258469e9 / t3 + 2.1070379e6 / t2 + 0.2226347e3 / t + 0.24039;

  const x2 = x * x;
  const x3 = x2 * x;

  const y =
    t <= 2222
      ? -1.1063814 * x3 - 1.3481102 * x2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x3 - 5.8733867 * x2 + 3.75112997 * x - 0.37001483;

  return [x, y];
}

/**
 * CIE 1931 xy to CIE 1960 uv, and back.
 *
 * The detour exists because the green/magenta axis is only meaningful in a
 * space where distance means something perceptual. In xy the locus is a curve
 * through a badly warped plane and "a bit off it" is not a quantity; uv is the
 * space Duv is defined in, and stepping perpendicular to the locus there is
 * what a camera's tint slider actually does.
 */
export function xyToUv(xy: readonly [number, number]): [number, number] {
  const d = -2 * xy[0] + 12 * xy[1] + 3;
  return [(4 * xy[0]) / d, (6 * xy[1]) / d];
}

export function uvToXy(uv: readonly [number, number]): [number, number] {
  const d = 2 * uv[0] - 8 * uv[1] + 4;
  return [(3 * uv[0]) / d, (2 * uv[1]) / d];
}

/**
 * Chromaticity of a source at a given temperature and distance off the locus.
 *
 * The normal is taken from the locus itself, by finite difference, rather than
 * from a table — it has to be the normal *at this temperature*, since the locus
 * turns through most of a right angle between a candle and daylight and a fixed
 * offset direction would send a warm tint one way and a cool one another.
 *
 * The sign convention is the usual one: positive Duv toward green.
 */
export function sourceChromaticity(kelvin: number, duv: number): [number, number] {
  const uv = xyToUv(planckianChromaticity(kelvin));
  if (duv === 0) return uvToXy(uv);

  // A degree or so of temperature either side: small enough to be a tangent,
  // large enough not to be floating-point noise.
  const step = Math.max(1, kelvin * 0.001);
  const ahead = xyToUv(planckianChromaticity(kelvin + step));
  const behind = xyToUv(planckianChromaticity(kelvin - step));

  const tu = ahead[0] - behind[0];
  const tv = ahead[1] - behind[1];
  const len = Math.hypot(tu, tv) || 1;

  // Rotate the tangent a quarter turn. Both components of the tangent are
  // negative — u and v both fall as a blackbody heats up — so it is the
  // clockwise quarter, (tv, -tu), that points up and to the left in uv, which
  // is the green side. Anticlockwise would send the fluorescent tube magenta
  // and the aquarium light green, and both would look plausible enough in a
  // single screenshot to go unnoticed.
  return uvToXy([uv[0] + (tv / len) * duv, uv[1] - (tu / len) * duv]);
}

// --- chromaticity to something a shader can multiply by ---------------------

/** CIE XYZ (D65) to linear sRGB. */
const XYZ_TO_RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252]
] as const;

const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * How little of a channel a bulb is allowed to have left, as a fraction of its
 * own luminance.
 *
 * Reached only by the warm end, and it is doing real work there. A 1850 K
 * blackbody is a more saturated orange than sRGB can represent — its blue
 * primary coefficient comes out negative — and the obvious repair, clamping at
 * zero, gives a light with *no* blue in it at all. That is not a candle, it is
 * a two-channel image: the water's blue absorption stops being visible, the
 * cool fill turns the same orange as the key, and every hue in the tank
 * collapses onto one line. Real firelight is desperately short of blue, not
 * free of it.
 */
const GAMUT_FLOOR = 0.07;

/**
 * A chromaticity as linear sRGB, normalised to unit luminance.
 *
 * Unit luminance is what keeps the two controls independent: picking a candle
 * changes the colour of the light and nothing else, and how bright the room is
 * stays entirely the level control's business.
 *
 * Out-of-gamut is the ordinary case at the warm end, not an error, and the
 * repair is to desaturate toward white rather than to clip. Mixing toward white
 * costs some saturation and keeps the hue; clipping keeps the saturation and
 * loses a whole primary. It is also free of side effects here, since white is
 * itself unit luminance — a mix of two unit-luminance colours is another one,
 * so the gamut repair cannot smuggle in a brightness change.
 */
export function chromaticityToLinearRgb(xy: readonly [number, number]): [number, number, number] {
  const [x, y] = xy;
  if (y <= 0) return [1, 1, 1];

  // xyY with Y = 1.
  const X = x / y;
  const Z = (1 - x - y) / y;

  const rgb = XYZ_TO_RGB.map((row) => row[0] * X + row[1] * 1 + row[2] * Z) as unknown as [
    number,
    number,
    number
  ];

  // Normalise first: the matrix is exact only up to rounding, and everything
  // below is stated as a fraction of luminance.
  const luminance = LUMA[0] * rgb[0] + LUMA[1] * rgb[1] + LUMA[2] * rgb[2];
  if (luminance <= 0) return [1, 1, 1];
  const unit = rgb.map((c) => c / luminance) as [number, number, number];

  const low = Math.min(unit[0], unit[1], unit[2]);
  if (low >= GAMUT_FLOOR) return unit;

  // Solve (1 - t) * low + t = GAMUT_FLOOR for the least white that lifts the
  // weakest channel to the floor.
  const t = (GAMUT_FLOOR - low) / (1 - low);
  return unit.map((c) => c * (1 - t) + t) as [number, number, number];
}

/** Linear sRGB of a named source, at unit luminance. */
export function lightSourceColour(source: LightSource): [number, number, number] {
  return chromaticityToLinearRgb(sourceChromaticity(source.kelvin, source.duv));
}

/**
 * How much the eye is allowed to be told the light has changed.
 *
 * Applied as an exponent on the ratio, so 1.0 is the full physical difference
 * and 0 is no difference at all. It is here because a room *lit* by candlelight
 * does not look as orange as a photograph of one: the visual system adapts to
 * whatever illuminant it has been sitting under, and a screen in the corner of
 * a differently-lit room gets none of that adaptation. Rendering the full ratio
 * makes the candle preset look less like candlelight than a slightly softened
 * one does, which is the whole argument for the number being here.
 *
 * The default source is unaffected either way: its ratio is 1, and 1 to any
 * power is 1.
 */
export const ADAPTATION = 0.78;

/**
 * The new bulb divided by the one the palette was authored under.
 *
 * Every authored radiance in the scene is multiplied by this, channel by
 * channel. That it is a ratio rather than a colour is the point: it leaves the
 * *relationships* in the palette alone — the gravel stays browner than the
 * glass, the haze stays greener than the gravel — and moves only the white
 * point they all sit under, which is what changing a bulb does to a room.
 */
export function whiteBalance(id: LightSourceId): [number, number, number] {
  if (id === REFERENCE_SOURCE_ID) return [1, 1, 1];

  const source = lightSourceColour(lightSourceById(id));
  const reference = lightSourceColour(lightSourceById(REFERENCE_SOURCE_ID));

  return [0, 1, 2].map((i) => Math.pow(source[i] / reference[i], ADAPTATION)) as [
    number,
    number,
    number
  ];
}

/** Everything the scene needs to light itself, derived from the three settings. */
export interface ResolvedLighting {
  /** Per-channel multiplier on every authored radiance in the scene. */
  balance: [number, number, number];
  /** Multiplier on the exposure. */
  level: number;
  /** Which set of authored radiances the balance is applied to. */
  tone: RoomToneId;
}

export function resolveLighting(settings: {
  lightSource: LightSourceId;
  lightLevel: LightLevel;
  roomTone: RoomToneId;
}): ResolvedLighting {
  return {
    balance: whiteBalance(settings.lightSource),
    level: levelScale(settings.lightLevel),
    tone: settings.roomTone
  };
}
