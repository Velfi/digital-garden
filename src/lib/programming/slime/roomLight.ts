import * as THREE from 'three';
import type { ResolvedLighting } from '../marimo/lighting';
import { DEFAULT_ROOM_TONE, type RoomToneId } from '../marimo/lighting';

/**
 * The room outside the glass — the marimo's room model, moved next door.
 *
 * One `roomRadiance` function shared by everything that reflects, refracts or
 * shows the room (the backdrop dome, both glass panes, the pedestal, the
 * slime's volume material), driven by uniforms rather than constants so the
 * lighting settings can repaint it live. The controls are the marimo's own —
 * same bulbs, same three-step level, same two rooms — because the two tanks
 * sit on the same site and should answer to the same switches; `lighting.ts`
 * is imported from the marimo directly rather than copied.
 *
 * The old room here was an authored green gradient with a painted hedge in
 * front of it. Both are gone: the terrarium now stands where the jar does —
 * an unlit room with one lamp above it, or the same lamp with cream walls to
 * come back off. What the palettes below author is the *dry* version of that
 * photograph: the terrarium keeps ordinary Three lights for its opaque
 * contents, so each tone also carries the intensities those lights take.
 */

/** The lamp hangs where the key light is: high, well off to the left. */
const LAMP_DIR = new THREE.Vector3(-0.16, 0.2, 0.05).normalize();

function glslLampDir(): string {
  return `normalize(vec3(${LAMP_DIR.x.toFixed(5)}, ${LAMP_DIR.y.toFixed(5)}, ${LAMP_DIR.z.toFixed(5)}))`;
}

export const ROOM_GLSL = /* glsl */ `
uniform vec3  uRoomZenith;
uniform vec3  uRoomHorizon;
uniform vec3  uRoomFloor;
uniform vec3  uLampColour;
uniform float uLampIntensity;
uniform float uRoomExposure;

const vec3 LAMP_DIR = ${glslLampDir()};

vec3 roomRadiance(vec3 dir) {
  vec3 d = normalize(dir);
  vec3 base = mix(uRoomHorizon, uRoomZenith, pow(clamp(d.y, 0.0, 1.0), 0.8));
  base = mix(base, uRoomFloor, pow(clamp(-d.y, 0.0, 1.0), 0.5));

  float cosLamp = clamp(dot(d, LAMP_DIR), 0.0, 1.0);
  float core = pow(cosLamp, 240.0);
  float halo = pow(cosLamp, 6.0);
  return (base + uLampColour * uLampIntensity * (core * 7.0 + halo * 0.45)) * uRoomExposure;
}
`;

/** The uniform block every room-facing material spreads into its own. The
 * pedestal entries are declared only by the pedestal shader, marimo-style:
 * the others carry them and never bind them. */
export interface SlimeRoomUniforms {
  uRoomZenith: { value: THREE.Vector3 };
  uRoomHorizon: { value: THREE.Vector3 };
  uRoomFloor: { value: THREE.Vector3 };
  uLampColour: { value: THREE.Vector3 };
  uLampIntensity: { value: number };
  uRoomExposure: { value: number };
  uPedestalColour: { value: THREE.Color };
  uPedestalFalloff: { value: number };
}

/**
 * Everything a tone authors, radiances and Three-light levels together — they
 * are one photograph and must move as one. Radiances for the dome, panes and
 * pedestal are the marimo's own numbers (same lamp, same rooms); the light
 * intensities are this scene's, because the marimo lights nothing with a
 * directional light and the terrarium lights everything opaque with three.
 */
interface SlimeRoomPalette {
  roomZenith: readonly [number, number, number];
  roomHorizon: readonly [number, number, number];
  roomFloor: readonly [number, number, number];
  lamp: readonly [number, number, number];
  /** Plinth albedo (sRGB hex — a painted surface, never balanced) and how
   * fast it falls to darkness going down. */
  pedestal: number;
  pedestalFalloff: number;
  /** The Three rig under this tone: hemisphere sky/ground colours ride the
   * white balance; the intensities are the tone's own. */
  hemiSky: readonly [number, number, number];
  hemiGround: readonly [number, number, number];
  hemiIntensity: number;
  /** Key and fill tints in linear RGB (the old rig's 0xfff2df / 0xcfd8e0,
   * converted), with per-tone intensities. */
  keyColour: readonly [number, number, number];
  keyIntensity: number;
  fillColour: readonly [number, number, number];
  fillIntensity: number;
}

const ROOMS: Readonly<Record<RoomToneId, SlimeRoomPalette>> = Object.freeze({
  /** Unlit room, one lamp above the box, the terrarium the only lit thing. */
  dark: {
    roomZenith: [0.1, 0.112, 0.14],
    roomHorizon: [0.006, 0.0075, 0.0095],
    roomFloor: [0.002, 0.0025, 0.003],
    lamp: [1.0, 0.96, 0.88],
    pedestal: 0x6b6053,
    pedestalFalloff: 0.035,
    hemiSky: [0.62, 0.6, 0.55],
    hemiGround: [0.05, 0.045, 0.04],
    hemiIntensity: 0.5,
    keyColour: [1, 0.886, 0.736],
    keyIntensity: 2.6,
    fillColour: [0.62, 0.68, 0.73],
    fillIntensity: 0.22
  },
  /** The same lamp with warm cream walls to arrive back off. */
  cream: {
    roomZenith: [0.609, 0.567, 0.486],
    roomHorizon: [0.554, 0.515, 0.442],
    roomFloor: [0.399, 0.371, 0.318],
    lamp: [1.0, 0.96, 0.88],
    pedestal: 0xcfc4b2,
    pedestalFalloff: 0.3,
    hemiSky: [0.96, 0.94, 0.9],
    hemiGround: [0.35, 0.32, 0.27],
    hemiIntensity: 0.85,
    keyColour: [1, 0.886, 0.736],
    keyIntensity: 2.2,
    fillColour: [0.75, 0.72, 0.64],
    fillIntensity: 0.75
  }
});

/**
 * The unlit room after the lamp goes out for the night: moonlight through a
 * window somewhere, and very little of it. Not a RoomToneId — night is not a
 * setting but the *time*, laid over the dark room when the visitor's clock
 * says so. Lights-on (cream) overrides it completely: someone switched the
 * room light on at midnight, which is exactly what that looks like.
 */
const NIGHT_ROOM: SlimeRoomPalette = {
  roomZenith: [0.014, 0.02, 0.036],
  roomHorizon: [0.003, 0.0045, 0.008],
  roomFloor: [0.001, 0.0013, 0.002],
  lamp: [0.05, 0.07, 0.12],
  pedestal: 0x6b6053,
  pedestalFalloff: 0.02,
  hemiSky: [0.22, 0.28, 0.42],
  hemiGround: [0.02, 0.022, 0.03],
  hemiIntensity: 0.2,
  keyColour: [0.55, 0.66, 0.92],
  keyIntensity: 0.5,
  fillColour: [0.3, 0.36, 0.5],
  fillIntensity: 0.1
};

function roomPalette(tone: RoomToneId, night: boolean): SlimeRoomPalette {
  if (night && tone === 'dark') return NIGHT_ROOM;
  return ROOMS[tone] ?? ROOMS[DEFAULT_ROOM_TONE];
}

/** Whether the visitor's clock says the lamp should be off. */
export function isNightAt(hour: number): boolean {
  return hour >= 21 || hour < 6;
}

export function createRoomUniforms(): SlimeRoomUniforms {
  const base = roomPalette(DEFAULT_ROOM_TONE, false);
  return {
    uRoomZenith: { value: new THREE.Vector3().fromArray(base.roomZenith) },
    uRoomHorizon: { value: new THREE.Vector3().fromArray(base.roomHorizon) },
    uRoomFloor: { value: new THREE.Vector3().fromArray(base.roomFloor) },
    uLampColour: { value: new THREE.Vector3().fromArray(base.lamp) },
    uLampIntensity: { value: 1 },
    uRoomExposure: { value: 1 },
    uPedestalColour: { value: new THREE.Color(base.pedestal) },
    uPedestalFalloff: { value: base.pedestalFalloff }
  };
}

/** The Three lights the tone reaches into alongside the radiances. */
export interface SlimeSceneLights {
  hemisphere: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
}

function setBalanced(
  target: THREE.Vector3,
  base: readonly [number, number, number],
  balance: readonly [number, number, number]
): void {
  target.set(base[0] * balance[0], base[1] * balance[1], base[2] * balance[2]);
}

/**
 * Put a bulb in the lamp, turn it up or down, and paint the room — the
 * marimo's `applyLighting`, for this scene's rig. Balance goes on every
 * radiance and on the light colours; level goes once on the room exposure and
 * once on each light intensity (the same single-source argument: everything
 * in shot is the one lamp, so scaling all of it uniformly is honest). Always
 * written from the palette, never multiplied onto what was there, so toggling
 * back and forth cannot drift.
 */
export function applyRoomLighting(
  room: SlimeRoomUniforms,
  lights: SlimeSceneLights,
  lighting: ResolvedLighting,
  /** Lay the night variant over the dark room (see NIGHT_ROOM). */
  night = false
): void {
  const { balance, level, tone } = lighting;
  const base = roomPalette(tone, night);

  setBalanced(room.uRoomZenith.value, base.roomZenith, balance);
  setBalanced(room.uRoomHorizon.value, base.roomHorizon, balance);
  setBalanced(room.uRoomFloor.value, base.roomFloor, balance);
  setBalanced(room.uLampColour.value, base.lamp, balance);
  room.uRoomExposure.value = level;
  room.uPedestalColour.value.setHex(base.pedestal);
  room.uPedestalFalloff.value = base.pedestalFalloff;

  lights.hemisphere.color.setRGB(
    base.hemiSky[0] * balance[0],
    base.hemiSky[1] * balance[1],
    base.hemiSky[2] * balance[2]
  );
  lights.hemisphere.groundColor.setRGB(
    base.hemiGround[0] * balance[0],
    base.hemiGround[1] * balance[1],
    base.hemiGround[2] * balance[2]
  );
  lights.hemisphere.intensity = base.hemiIntensity * level;
  lights.key.color.setRGB(
    base.keyColour[0] * balance[0],
    base.keyColour[1] * balance[1],
    base.keyColour[2] * balance[2]
  );
  lights.key.intensity = base.keyIntensity * level;
  lights.fill.color.setRGB(
    base.fillColour[0] * balance[0],
    base.fillColour[1] * balance[1],
    base.fillColour[2] * balance[2]
  );
  lights.fill.intensity = base.fillIntensity * level;
}
