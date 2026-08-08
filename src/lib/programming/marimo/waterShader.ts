import * as THREE from 'three';
import { FLOOR_Y, TANK_HALF_X, TANK_HALF_Z, WATER_Y } from './constants';
import { HDR_GLSL } from './hdr';
import { DEFAULT_ROOM_TONE, type RoomToneId } from './lighting';

/**
 * Shared GLSL for everything seen through the water.
 *
 * The volume model is single-scattering Beer-Lambert with separate per-channel
 * absorption and scattering:
 *
 *     L = L0 * exp(-sigmaT * d) + (sigmaS / sigmaT) * Lambient * (1 - exp(-sigmaT * d))
 *
 * Two things make this read as water rather than as fog. First, `d` is the true
 * path length *through the water volume*, found by intersecting the view ray
 * with the water box — so the air between the camera and the glass costs
 * nothing, and a marimo poking out of the surface is correctly unattenuated
 * above the waterline. Second, the coefficients are wavelength-dependent and
 * built from the three things actually in a marimo jar.
 *
 * Lighting is hand-rolled — two fixed directional terms, no three.js lights in
 * the scene at all. Consistent across every surface.
 */

export const WATER_GLSL = /* glsl */ `
uniform vec3  uSigmaA;          // absorption per metre, per channel
uniform vec3  uSigmaS;          // scattering per metre, per channel
uniform vec3  uScatterColour;   // ambient radiance available to scatter in
uniform vec3  uWaterBoxMin;
uniform vec3  uWaterBoxMax;
uniform float uExposure;
uniform float uShadeFloor;      // how much of the room reaches the gravel bed

// The lit range: the gravel bed up to the waterline. Baked from the constants
// rather than read off the water box, whose ceiling animates down to the floor
// during a water change — the lamp does not move when the jar is drained.
const float LIT_BOTTOM = ${FLOOR_Y.toFixed(4)};
const float LIT_TOP    = ${WATER_Y.toFixed(4)};

/**
 * How much of the room reaches a given height in the jar.
 *
 * With one source hanging above the jar the bottom of the column is further
 * from the light, shadowed by everything above it, and reached only through a
 * longer stretch of water. This is the term that makes the tank read as lit
 * from above rather than as a uniformly glowing box.
 *
 * The square root keeps the falloff gentle through the middle of the column,
 * where the marimo actually lives, and puts most of the darkening in the last
 * centimetre above the gravel.
 *
 * How dark the bottom gets is the room's, not the lamp's. It is the ratio of
 * light arriving from above to light arriving from everywhere, and with black
 * walls there is no everywhere — hence 0.55, and a gravel bed that all but
 * disappears. Put cream walls in and the sides of the jar are lit too, so the
 * floor of the ramp comes most of the way up and the bed reads as gravel again
 * rather than as a black band under a bright column.
 */
float overheadShade(float y) {
  float t = clamp((y - LIT_BOTTOM) / (LIT_TOP - LIT_BOTTOM), 0.0, 1.0);
  return mix(uShadeFloor, 1.0, sqrt(t));
}

/**
 * The same, for light that scatters off the haze rather than off a surface.
 *
 * Squared, and not as a fudge: light lighting a solid surface has crossed the
 * water once, on the way down. Light you see scattered out of the volume has
 * crossed it going down *and* on the way back out to the eye, so the same depth
 * costs it twice. That is why the haze — which is most of what fills the frame,
 * the jar being far bigger than the shot — falls away faster than the things
 * inside it, and why the marimo can stay a bright subject while the water behind
 * it goes black.
 */
float scatteredShade(float y) {
  float shade = overheadShade(y);
  return shade * shade;
}

/**
 * The stretch of the segment a->b that lies inside the water box: its length,
 * and its midpoint through the out parameter.
 *
 * Standard slab test. Division by zero is deliberate: IEEE infinities give the
 * right answer through min/max for rays parallel to a slab.
 */
float waterPathLength(vec3 a, vec3 b, out vec3 midpoint) {
  midpoint = a;

  vec3 delta = b - a;
  float len = length(delta);
  if (len < 1e-7) return 0.0;
  vec3 dir = delta / len;

  vec3 invDir = 1.0 / dir;
  vec3 tA = (uWaterBoxMin - a) * invDir;
  vec3 tB = (uWaterBoxMax - a) * invDir;
  vec3 tNear = min(tA, tB);
  vec3 tFar = max(tA, tB);

  float t0 = max(max(tNear.x, tNear.y), max(tNear.z, 0.0));
  float t1 = min(min(tFar.x, tFar.y), min(tFar.z, len));

  float d = max(0.0, t1 - t0);
  midpoint = a + dir * (t0 + d * 0.5);
  return d;
}

float waterPathLength(vec3 a, vec3 b) {
  vec3 midpoint;
  return waterPathLength(a, b, midpoint);
}

/**
 * How far a ray runs before it leaves the jar — the far glass, or the gravel
 * bed, whichever it reaches first.
 *
 * The same slab test as above, keeping only the far crossings. It is used to
 * find what a reflected ray is looking at, which is the one number a planar
 * reflection cannot get from its own render: the texture says what lies in each
 * direction from the mirror camera, and turning that into what lies in a given
 * direction from a point somewhere else needs a distance.
 *
 * Clamped rather than trusted. A surface fragment sits exactly on the top of the
 * box, which is the one place the slab test can hand back a zero times an
 * infinity, and clamping in this order collapses that to the near limit instead
 * of letting it through.
 */
float waterBoxExit(vec3 origin, vec3 dir) {
  vec3 invDir = 1.0 / dir;
  vec3 tFar = max((uWaterBoxMin - origin) * invDir, (uWaterBoxMax - origin) * invDir);
  return clamp(min(min(tFar.x, tFar.y), tFar.z), 0.002, 0.15);
}

/**
 * Attenuate and haze a colour over an explicit path length of water. The lit
 * factor is how much of the lamp reaches that stretch of the column: the haze
 * can only scatter light that got there.
 */
vec3 applyWaterOverDistance(vec3 colour, float d, float lit) {
  vec3 sigmaT = max(uSigmaA + uSigmaS, vec3(1e-4));
  vec3 transmittance = exp(-sigmaT * d);
  vec3 inscatter = (uSigmaS / sigmaT) * uScatterColour * lit * (1.0 - transmittance);
  return colour * transmittance + inscatter;
}

vec3 applyWaterOverDistance(vec3 colour, float d) {
  return applyWaterOverDistance(colour, d, 1.0);
}

/**
 * Attenuate a surface colour along the view ray from the camera.
 *
 * The haze is weighted by the light at the midpoint of the submerged stretch,
 * which for a single overhead source is a good deal closer than evaluating it at
 * either end: at the far wall of the jar the near end of the ray is out in the
 * air and the far end is up against the glass, and neither is where most of the
 * scattering happens.
 */
vec3 applyWater(vec3 colour, vec3 worldPos) {
  vec3 midpoint;
  float d = waterPathLength(cameraPosition, worldPos, midpoint);
  return applyWaterOverDistance(colour, d, scatteredShade(midpoint.y));
}
`;

/**
 * Where the lamp hangs, as a unit direction from the jar.
 *
 * Steep and just off vertical: high enough to be out of shot from any angle the
 * camera can reach, off-axis enough that its reflection in the glass and its
 * hot spot in Snell's window do not sit dead centre. Shared by the room model
 * and the direct lighting so the two cannot drift apart.
 */
const LAMP_DIR = [0.18, 0.97, 0.16] as const;

function glslLampDir(): string {
  return `normalize(vec3(${LAMP_DIR.map((c) => c.toFixed(4)).join(', ')}))`;
}

/**
 * What is around the jar: a dark room, not a sky.
 *
 * The jar stands on a pedestal in the middle of an unlit room with one bright
 * source hanging above it, just out of frame. That arrangement is almost all
 * contrast: the ceiling around the lamp carries a little bounce, everything at
 * the jar's own height is in shadow, and below the pedestal there is nothing at
 * all. So the gradient is split at the horizon rather than blended smoothly
 * across the whole sphere — a smooth blend puts half the zenith's brightness on
 * the wall at eye level, which is exactly the part that has to stay black for
 * the tank to read as the only lit thing in the room.
 *
 * The lamp gets two lobes. The narrow one is the source itself, and it has to be
 * genuinely bright — several times the ceiling — because seen from underwater
 * through Snell's window the entire room compresses into a 97-degree cone, and
 * without a hot centre that cone is just a grey disc. The wide one is the haze
 * and spill around it, which is what actually lights the top of the backdrop.
 */
export const ROOM_GLSL = /* glsl */ `
uniform vec3  uRoomZenith;
uniform vec3  uRoomHorizon;
uniform vec3  uRoomFloor;
uniform vec3  uLampColour;
uniform float uLampIntensity;

const vec3 LAMP_DIR = ${glslLampDir()};

vec3 roomRadiance(vec3 dir) {
  vec3 d = normalize(dir);
  vec3 base = mix(uRoomHorizon, uRoomZenith, pow(clamp(d.y, 0.0, 1.0), 0.8));
  base = mix(base, uRoomFloor, pow(clamp(-d.y, 0.0, 1.0), 0.5));

  float cosLamp = clamp(dot(d, LAMP_DIR), 0.0, 1.0);
  float core = pow(cosLamp, 240.0);
  float halo = pow(cosLamp, 6.0);
  return base + uLampColour * uLampIntensity * (core * 7.0 + halo * 0.45);
}
`;

export const LIGHTING_GLSL = /* glsl */ `
uniform vec3 uKeyColour;    // the lamp, direct
uniform vec3 uFillColour;   // what comes back off the pedestal and the glass

const vec3 KEY_DIR  = ${glslLampDir()};
const vec3 FILL_DIR = normalize(vec3(-0.5, 0.1, -0.6));

// Half-Lambert: soft, wraps around the terminator, flatters organic surfaces.
float wrapDiffuse(vec3 n, vec3 l) {
  float d = dot(n, l) * 0.5 + 0.5;
  return d * d;
}

vec3 twoLightDiffuse(vec3 n) {
  return uKeyColour * wrapDiffuse(n, KEY_DIR) + uFillColour * wrapDiffuse(n, FILL_DIR) * 0.55;
}
`;

/** Refractive indices, for Snell and Fresnel at the surface and the glass. */
export const IOR_AIR = 1.0;
export const IOR_WATER = 1.333;
export const IOR_GLASS = 1.52;

/** Uniform block every water-facing material shares. Values pushed by the scene. */
export interface WaterUniforms {
  uSigmaA: { value: THREE.Vector3 };
  uSigmaS: { value: THREE.Vector3 };
  uScatterColour: { value: THREE.Vector3 };
  uWaterBoxMin: { value: THREE.Vector3 };
  uWaterBoxMax: { value: THREE.Vector3 };
  uExposure: { value: number };
  uShadeFloor: { value: number };
}

export interface RoomUniforms {
  uRoomZenith: { value: THREE.Vector3 };
  uRoomHorizon: { value: THREE.Vector3 };
  uRoomFloor: { value: THREE.Vector3 };
  uLampColour: { value: THREE.Vector3 };
  uLampIntensity: { value: number };
  /**
   * The plinth's albedo and how fast it falls into shadow going down. Part of
   * the room block rather than the pedestal's own, because both are answers to
   * "what is this jar standing in" and a bright room that kept the black plinth
   * would sit a dark slab across the bottom of a cream frame. Declared only by
   * the pedestal shader; the other materials carry the entry and never bind it.
   */
  uPedestalColour: { value: THREE.Color };
  uPedestalFalloff: { value: number };
}

/** The two directional terms, for everything that includes `LIGHTING_GLSL`. */
export interface LightUniforms {
  uKeyColour: { value: THREE.Vector3 };
  uFillColour: { value: THREE.Vector3 };
}

/**
 * Every authored radiance in the scene, in one table per room.
 *
 * They are gathered here rather than left where they were used because they are
 * not independent: all of them are the same lamp arriving by different routes,
 * so changing the bulb — or the walls it comes back off — has to move all of
 * them together. `applyLighting` is the only thing that reads them, and it
 * always writes every one from the table, never a multiply on whatever was
 * there before, which is what keeps the tank from drifting as the settings are
 * changed back and forth.
 *
 * The two rooms share the lamp exactly: same chromaticity, same key, same
 * exposure. Everything that differs between them is light that has bounced off
 * something first, which is the only thing painting the walls can change.
 */
interface RoomPalette {
  roomZenith: readonly [number, number, number];
  roomHorizon: readonly [number, number, number];
  roomFloor: readonly [number, number, number];
  lamp: readonly [number, number, number];
  key: readonly [number, number, number];
  fill: readonly [number, number, number];
  scatter: readonly [number, number, number];
  /** Floor of `overheadShade`: what reaches the gravel bed. */
  shadeFloor: number;
  /** Authored in sRGB, like any other albedo — it is a painted surface. */
  pedestal: number;
  pedestalFalloff: number;
}

const ROOMS: Readonly<Record<RoomToneId, RoomPalette>> = Object.freeze({
  /**
   * The room the whole scene was authored in: unlit, one lamp above the jar,
   * and the tank the only lit thing in shot.
   */
  dark: {
    /** Ceiling around the lamp: dim bounce, not a sky. */
    roomZenith: [0.1, 0.112, 0.14],
    /**
     * The far wall at the jar's own height. This is the value the whole tank is
     * seen against — through the far pane, and directly in the strip of room
     * either side of the glass — so it has to sit below the darkest part of the
     * water. Anything brighter and the room reads as the lit thing and the tank
     * as a dark box standing in front of it, which is the wrong way round.
     */
    roomHorizon: [0.006, 0.0075, 0.0095],
    /** Under the pedestal. Nothing gets down here. */
    roomFloor: [0.002, 0.0025, 0.003],
    lamp: [1.0, 0.96, 0.88],
    key: [1.12, 1.08, 0.98],
    /**
     * Barely anything. In a dark room the only fill is what the lamp bounces
     * off the pedestal and the glass, and it is cold compared with the source.
     */
    fill: [0.1, 0.15, 0.17],
    /**
     * Ambient radiance available to scatter in. Well down from what the cream
     * room gets: the haze fills most of the frame, so it is the value that
     * decides how dark the tank reads, and with a single lamp above and black
     * walls around there is very little going into the water off-axis.
     * `scatteredShade` puts the vertical gradient on it.
     */
    scatter: [0.19, 0.245, 0.235],
    /** Nothing comes at the bed from the sides, so it is very nearly a silhouette. */
    shadeFloor: 0.55,
    pedestal: 0x6b6053,
    /**
     * Metres over which the plinth falls to darkness. Short, because there is
     * nothing under it to bounce back up — it simply stops being lit, some way
     * before the bottom of the frame.
     */
    pedestalFalloff: 0.035
  },

  /**
   * The same jar and the same lamp, in a room with warm cream walls.
   *
   * Every number below is up, and none of them by an amount that was chosen
   * separately: the walls are what the lamp bounces off, the fill is that same
   * bounce arriving at the marimo, and the haze is it arriving at the water.
   * Turning the walls up without the other two would give a bright backdrop
   * with an unlit subject cut out in front of it.
   *
   * The walls are nowhere near white, and cannot be. Radiance here is
   * pre-exposure, and the horizon has to clear `BASE_EXPOSURE` times the
   * `bright` level — 1.77 — without reaching 1.0, or turning the lamp up would
   * flatten the room to paper and take the corner of the jar with it. What
   * reaches the eye is lighter than the walls are, not darker, because the haze
   * between adds to them; the numbers below read dim for the picture they make.
   */
  cream: {
    /** Ceiling: nearest the lamp, and the brightest thing that is not the lamp. */
    roomZenith: [0.609, 0.567, 0.486],
    /**
     * The wall the tank is seen against. The dark room needed this below the
     * darkest water so the jar stayed the lit thing; here the relationship is
     * frankly inverted — the jar is a dark green ball on a bright sweep, read
     * by its silhouette and its rim rather than by being the only thing giving
     * off light. That is the picture this tone is for.
     */
    roomHorizon: [0.554, 0.515, 0.442],
    /** Down in the shadow the pedestal casts on its own sweep, but never black. */
    roomFloor: [0.399, 0.371, 0.318],
    lamp: [1.0, 0.96, 0.88],
    key: [1.12, 1.08, 0.98],
    /**
     * Six times the dark room's, and warm rather than cold, because it is now
     * cream walls doing the bouncing rather than a sliver of wet glass. This is
     * what stops the shadow side of the marimo going to nothing, and it is the
     * single number that makes the tone read as a bright room rather than as a
     * dark room with the backdrop turned up.
     */
    fill: [0.6, 0.575, 0.51],
    /**
     * Up four-fold, and — unlike the dark room's — the colour of the walls
     * rather than of the water.
     *
     * This is the number that decides what the tone actually looks like, and it
     * is worth saying why it is so much larger than the walls it comes from.
     * The jar fills the frame, so nearly every pixel is the far pane seen
     * through the *whole width* of the water: eleven centimetres at the
     * exaggerated particulate load `waterCoefficients` uses, which lets barely
     * half the room through. The haze has to make up the rest, or a cream room
     * arrives as a mid sage one.
     *
     * The green bias goes with it. In an unlit room the only ambient to scatter
     * is light that has already been through the water and taken its colour; in
     * a cream one it is the walls, straight off the paint. Keeping the old bias
     * here was what made the first cut of this tone read sage rather than cream.
     *
     * It does not follow that more is better. What keeps the marimo legible is
     * that its own path is a third as long as the backdrop's — the haze in front
     * of it is thin while the haze behind it is thick, which is the depth cue
     * doing the work. Push this much past the walls' own radiance and that gap
     * closes: the ball flattens into the field and the jar reads as fog in a box.
     */
    scatter: [0.84, 0.785, 0.673],
    /**
     * Nearly flat. The walls light the sides of the jar as well as the top, so
     * the bed is no longer at the far end of a single beam — and with the water
     * above it now bright, a bed left at 0.55 reads as a black band rather than
     * as gravel.
     */
    shadeFloor: 0.85,
    /** A painted plinth rather than a dark wooden one — it is lit from all sides now. */
    pedestal: 0xcfc4b2,
    /**
     * An order of magnitude longer than the dark room's. With walls around it
     * the plinth is lit all the way down, and the fall-off is left in only as
     * the gentle grounding shadow a bright room still puts under a table.
     */
    pedestalFalloff: 0.3
  }
});

function roomPalette(tone: RoomToneId): RoomPalette {
  return ROOMS[tone] ?? ROOMS[DEFAULT_ROOM_TONE];
}

/**
 * Up from 1.15 with the room turned down. The jar is the only lit thing in
 * shot and has to stay a bright subject; it is the surroundings that go dark,
 * not the exposure.
 */
const BASE_EXPOSURE = 1.3;

export function createRoomUniforms(): RoomUniforms {
  const base = roomPalette(DEFAULT_ROOM_TONE);
  return {
    uRoomZenith: { value: new THREE.Vector3().fromArray(base.roomZenith) },
    uRoomHorizon: { value: new THREE.Vector3().fromArray(base.roomHorizon) },
    uRoomFloor: { value: new THREE.Vector3().fromArray(base.roomFloor) },
    uLampColour: { value: new THREE.Vector3().fromArray(base.lamp) },
    uLampIntensity: { value: 1 },
    uPedestalColour: { value: new THREE.Color(base.pedestal) },
    uPedestalFalloff: { value: base.pedestalFalloff }
  };
}

export function createWaterUniforms(): WaterUniforms {
  return {
    uSigmaA: { value: new THREE.Vector3() },
    uSigmaS: { value: new THREE.Vector3() },
    uScatterColour: {
      value: new THREE.Vector3().fromArray(roomPalette(DEFAULT_ROOM_TONE).scatter)
    },
    uWaterBoxMin: { value: new THREE.Vector3(-TANK_HALF_X, FLOOR_Y, -TANK_HALF_Z) },
    uWaterBoxMax: { value: new THREE.Vector3(TANK_HALF_X, 0, TANK_HALF_Z) },
    uExposure: { value: BASE_EXPOSURE },
    uShadeFloor: { value: roomPalette(DEFAULT_ROOM_TONE).shadeFloor }
  };
}

export function createLightUniforms(): LightUniforms {
  const base = roomPalette(DEFAULT_ROOM_TONE);
  return {
    uKeyColour: { value: new THREE.Vector3().fromArray(base.key) },
    uFillColour: { value: new THREE.Vector3().fromArray(base.fill) }
  };
}

/** The three uniform blocks the lighting settings reach into. */
export interface SceneUniforms {
  water: WaterUniforms;
  room: RoomUniforms;
  light: LightUniforms;
}

function setBalanced(
  target: THREE.Vector3,
  base: readonly number[],
  balance: readonly [number, number, number]
) {
  target.set(base[0] * balance[0], base[1] * balance[1], base[2] * balance[2]);
}

/**
 * Put a bulb in the lamp, turn it up or down, and paint the room.
 *
 * The white balance goes on every radiance, the level goes on the exposure, and
 * the tone chooses which radiances are being balanced in the first place. The
 * split is not arbitrary. Colour has to be applied per source, because the
 * ratio between the key, the fill and the haze is what makes the tank read as
 * one room. Brightness does not: with a single lamp lighting everything in
 * shot, scaling all of it is the same operation as scaling the image, and doing
 * it once at the end is both cheaper and impossible to apply unevenly.
 *
 * The plinth is the one thing here that is not balanced, and that is the point
 * of it being separate: it is an albedo, not a radiance. A surface does not
 * change colour when the bulb does — it just gets lit by a different light, and
 * it already is, through the `roomRadiance` it is multiplied by in the shader.
 * Balancing it too would apply the bulb twice.
 */
export function applyLighting(
  uniforms: SceneUniforms,
  lighting: { balance: readonly [number, number, number]; level: number; tone: RoomToneId }
): void {
  const { balance, level, tone } = lighting;
  const { water, room, light } = uniforms;
  const base = roomPalette(tone);

  setBalanced(room.uRoomZenith.value, base.roomZenith, balance);
  setBalanced(room.uRoomHorizon.value, base.roomHorizon, balance);
  setBalanced(room.uRoomFloor.value, base.roomFloor, balance);
  setBalanced(room.uLampColour.value, base.lamp, balance);
  setBalanced(light.uKeyColour.value, base.key, balance);
  setBalanced(light.uFillColour.value, base.fill, balance);
  setBalanced(water.uScatterColour.value, base.scatter, balance);

  water.uShadeFloor.value = base.shadeFloor;
  room.uPedestalColour.value.setHex(base.pedestal);
  room.uPedestalFalloff.value = base.pedestalFalloff;

  water.uExposure.value = BASE_EXPOSURE * level;
}

// --- the three things actually in the water -------------------------------

/**
 * Pure water absorption per metre near 620 / 550 / 450 nm. Water is genuinely
 * a blue liquid: it absorbs red about twenty times more strongly than blue.
 */
const PURE_WATER_ABSORPTION = [0.45, 0.074, 0.021] as const;

/**
 * Coloured dissolved organic matter — "yellow substance", the stuff an alga
 * leaches into standing water. Its absorption falls off exponentially with
 * wavelength (roughly exp(-0.014 * (lambda - 440))), so it eats blue hardest
 * and turns neglected water yellow-brown. This is the opposite bias to pure
 * water, which is why fouling shifts the hue rather than just darkening it.
 */
const CDOM_SHAPE = [0.08, 0.214, 0.87] as const;

/** Particulate scattering — nearly grey, with a mild blue bias. */
const PARTICULATE_SHAPE = [0.9, 1.0, 1.15] as const;

export interface WaterCoefficients {
  sigmaA: [number, number, number];
  sigmaS: [number, number, number];
}

/**
 * Absorption and scattering for a given fouling level.
 *
 * The CDOM and particulate loads are exaggerated well beyond a real 12 cm jar —
 * honest coefficients over that short a path are almost invisible, and the
 * scene would read as air. The *shapes* are physical, so the way the colour
 * shifts as it fouls is right even though the magnitude is dialled up.
 */
export function waterCoefficients(fouling: number): WaterCoefficients {
  const f = Math.max(0, Math.min(1, fouling));
  // Tuned against the real path length, which for this jar is only about 4.5 cm
  // from the camera through the glass to the marimo — an order of magnitude
  // shorter than the "view distance" the old single-coefficient murk was using,
  // and short enough that literal coefficients would do nothing at all.
  const cdom = 0.5 + 21.5 * f * f;
  const particles = 6.0 + 34.0 * f;

  return {
    sigmaA: [
      PURE_WATER_ABSORPTION[0] + cdom * CDOM_SHAPE[0],
      PURE_WATER_ABSORPTION[1] + cdom * CDOM_SHAPE[1],
      PURE_WATER_ABSORPTION[2] + cdom * CDOM_SHAPE[2]
    ],
    sigmaS: [
      particles * PARTICULATE_SHAPE[0],
      particles * PARTICULATE_SHAPE[1],
      particles * PARTICULATE_SHAPE[2]
    ]
  };
}

/** Fraction of light surviving a path, per channel. Used by tests. */
export function transmittance(
  coefficients: WaterCoefficients,
  distance: number
): [number, number, number] {
  return [0, 1, 2].map((i) =>
    Math.exp(-(coefficients.sigmaA[i] + coefficients.sigmaS[i]) * distance)
  ) as [number, number, number];
}

/** Schlick reflectance at an interface, with the correct dense-to-rare form. */
export function fresnelReflectance(cosIncident: number, iorFrom: number, iorTo: number): number {
  const eta = iorFrom / iorTo;
  const sin2t = eta * eta * (1 - cosIncident * cosIncident);
  if (sin2t > 1) return 1; // total internal reflection
  const r0 = ((iorFrom - iorTo) / (iorFrom + iorTo)) ** 2;
  // Going dense to rare, Schlick must use the transmitted angle or it badly
  // underestimates reflectance as the critical angle is approached.
  const cos = eta > 1 ? Math.sqrt(1 - sin2t) : cosIncident;
  return r0 + (1 - r0) * (1 - cos) ** 5;
}

/** Critical angle in radians for total internal reflection, water to air. */
export function criticalAngle(iorFrom = IOR_WATER, iorTo = IOR_AIR): number {
  return Math.asin(Math.min(1, iorTo / iorFrom));
}
