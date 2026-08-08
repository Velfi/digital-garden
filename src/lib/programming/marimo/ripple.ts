import * as THREE from 'three';

/**
 * The wave field on the water surface.
 *
 * This is its own module rather than a few constants inside the surface shader
 * because the ripples are the part of the water that has to be *looked at* to be
 * judged. Every number below is exposed as a uniform and driven by the bench at
 * `/marimo/ripples`, so tuning them is a matter of dragging a slider rather than
 * editing GLSL and waiting for a reload.
 *
 * The GLSL and the TypeScript below are the same function written twice, in the
 * same shape as `sphericalHarmonics.ts`. The copy costs a little duplication and
 * buys tests that can assert things a screenshot cannot — that the analytic
 * slope really is the derivative of the height, that the field averages flat, and
 * that the waves actually fit inside the jar.
 *
 * Units are chosen for the person turning the knobs: wavelengths and amplitudes
 * in millimetres, angles in degrees. The conversion to the radians-per-metre the
 * shader wants happens in one place, on the way to the uniforms.
 */

export interface RippleParams {
  /** Longest wavelength, mm. The jar is only about 110 mm across — see the tests. */
  wavelengthMm: number;
  /** Rough peak-to-trough at full agitation, mm. */
  amplitudeMm: number;
  /** Amplitude of still water, as a fraction of the full amplitude. */
  idleFraction: number;
  /** How many octaves to sum. */
  octaves: number;
  /** Direction of the longest wave, degrees. */
  baseAngleDeg: number;
  /** Wavelength shrinks by this factor each octave. */
  freqStep: number;
  /** Amplitude falls by this factor each octave. */
  ampStep: number;
  /** Angular speed of the longest wave, rad/s. */
  speed: number;
  /** Speed grows by this factor each octave. */
  speedStep: number;
  /** Turn between one octave's direction and the next, degrees. */
  turnDeg: number;
  /** 0 is a plain sine; 1 is narrow crests over wide flat troughs. */
  steepness: number;
  /** Drag along the accumulated slope, which leans the crests instead of leaving them symmetric. */
  chop: number;
  /**
   * How much of each wave comes back off the glass. 0 is open water and the
   * whole surface marches; 1 returns as much as went out.
   * See the note on `DEFAULT_RIPPLE` for why this is not a decoration.
   */
  reflection: number;
  /** How far off the exact reverse the returning wave comes back, degrees. */
  reflectionTurnDeg: number;
}

/**
 * Defaults.
 *
 * `wavelengthMm` is the one to be careful with. The jar interior is 110 x 90 mm,
 * so anything much above about 40 mm puts less than three waves across the whole
 * surface and it stops reading as ripples and starts reading as a sheet tilting.
 * `ripple.test.ts` holds a floor under this.
 *
 * `freqStep` decides whether this reads as a surface or as corrugated iron. The
 * eye is extremely good at spotting a single repeating wavelength, and a step of
 * 1.9 leaves such a gap between one octave and the next that it does not see a
 * spectrum, it sees four separate gratings laid over each other — worse at a
 * grazing angle, which is the only angle the tank camera ever has. Packed to
 * 1.45, with the amplitude falling off gently enough that no one octave carries
 * much over a third, the scales run into each other and it stops having a
 * wavelength you can point at. Five octaves then span 26 mm down to 6 mm.
 *
 * `speedStep` is not arbitrary. Gravity-capillary waves obey
 * `omega^2 = g*k + sigma*k^3/rho`, so at these wavelengths — where surface
 * tension already carries about a third of the restoring force — stepping the
 * wavenumber by 1.45 steps the frequency by between 1.39 and 1.51 depending on
 * where in the stack you are, and one constant has to stand in for all of it.
 * Short ripples genuinely do travel faster than long ones, and getting that
 * ratio roughly right is most of why a sum of octaves reads as one moving
 * surface rather than several sliding over each other.
 *
 * `speed` itself is deliberately unphysical. That same relation puts a real
 * 26 mm ripple at about 58 rad/s, which is 9 Hz — under two frames per cycle at
 * 60 fps, so it strobes into noise. Slowed to something a display can actually
 * resolve.
 *
 * `reflection` is the one that decides whether this looks like water in a jar
 * or like a conveyor belt. The same argument `swirl.ts` makes about vertical
 * flow applies to waves: a jar is closed, so a wave train cannot just keep
 * going. It reaches the glass and comes back, and what you look at is always
 * the outgoing wave on top of its own return. Without that second term there
 * is nothing in the field but plane waves at a fixed phase velocity, and the
 * only motion a sum of those can have is the whole surface sliding sideways
 * for ever — which is the bug this parameter exists to fix.
 *
 * `reflectionTurnDeg` is why it comes back at 26 degrees off rather than
 * straight down its own line. A wave that returns exactly reversed makes a
 * textbook standing wave, and a standing wave is flat twice a period: with one
 * octave carrying more than half the amplitude the entire surface would blink
 * out about four times a second. The jar is round, so a wave crossing it
 * off-centre genuinely does come back turned, and once the two legs are not
 * collinear their interference averages out over the water instead of
 * cancelling everywhere at once. The crests then stand and shimmer rather than
 * either marching or pulsing.
 *
 * `reflection` is held under 1 because glass, the meniscus and viscosity each
 * take a bite out of the returning wave. The leftover travelling part is what
 * keeps the pattern slowly reforming rather than locking in place.
 */
export const DEFAULT_RIPPLE: RippleParams = {
  wavelengthMm: 26,
  amplitudeMm: 1.1,
  idleFraction: 0.28,
  octaves: 5,
  baseAngleDeg: 34,
  freqStep: 1.45,
  ampStep: 0.68,
  speed: 12,
  speedStep: 1.46,
  turnDeg: 137.5,
  steepness: 0.65,
  chop: 0.5,
  reflection: 0.85,
  reflectionTurnDeg: 26
};

/**
 * Per-octave phase offsets, spatial and temporal, and the offset carried by the
 * returning leg for the extra distance it went to reach the glass.
 *
 * Without them every wave has zero phase at the origin, so all the octaves put
 * a node or an antinode at the middle of the jar — right where the marimo sits
 * — and all reach full amplitude together at t = 0. The golden angle and the
 * golden ratio are just numbers that never come back into step over six
 * octaves.
 */
const OCTAVE_PHASE = 2.39996323;
const OCTAVE_TIME = 1.61803399;
const RETURN_PHASE = 0.7853982;

/** Mean of `exp(sin x - 1)` over a period: `I0(1) / e`. Subtracted so the sum averages flat. */
const SHARP_MEAN = 0.4657596;

/** Compile-time ceiling on the loop; `uRippleOctaves` picks how many actually run. */
export const RIPPLE_MAX_OCTAVES = 6;

export const RIPPLE_GLSL = /* glsl */ `
uniform float uRippleK0;         // rad/m, longest wave
uniform float uRippleAmp;        // metres, at full agitation
uniform float uRippleIdle;       // amplitude fraction at rest
uniform float uRippleOctaves;
uniform float uRippleFreqStep;
uniform float uRippleAmpStep;
uniform float uRippleSpeed;      // rad/s
uniform float uRippleSpeedStep;
uniform vec2  uRippleDir;        // unit, direction of the longest wave
uniform vec2  uRippleTurn;       // (cos, sin) of the turn between octaves
uniform float uRippleSteep;
uniform float uRippleChop;
uniform float uRippleReflect;    // share of each wave that comes back off the glass
uniform vec2  uRippleBackTurn;   // (cos, sin) of how far off-reverse it comes back

const int RIPPLE_MAX_OCTAVES = ${RIPPLE_MAX_OCTAVES};
const float RIPPLE_SHARP_MEAN = ${SHARP_MEAN};
const float RIPPLE_OCTAVE_PHASE = ${OCTAVE_PHASE};
const float RIPPLE_OCTAVE_TIME = ${OCTAVE_TIME};
const float RIPPLE_RETURN_PHASE = ${RETURN_PHASE};

/**
 * One octave's crest profile and its derivative, as a function of phase, with
 * the mean already taken out so the wave averages flat on its own.
 *
 *   .x  height, .y  d(height)/d(phase)
 */
vec2 rippleCrest(float phase, float mean) {
  float s = sin(phase);
  float c = cos(phase);
  float sharp = exp(s - 1.0);
  return vec2(mix(s * 0.5 + 0.5, sharp, uRippleSteep) - mean,
              mix(c * 0.5, sharp * c, uRippleSteep));
}

/**
 * The surface, as height and slope together.
 *
 *   .x   height offset from flat, metres
 *   .yz  d(height)/d(x, z)
 *
 * Both crest shapes differentiate into something built from the sin and cos
 * already computed, so the slope is very nearly free — which is what lets the
 * normal be exact instead of finite-differenced across neighbouring pixels.
 *
 * Each octave is three waves, not one: the outgoing train along \`dir\`, and the
 * two legs it comes back on after the glass, turned either side of the exact
 * reverse by \`uRippleBackTurn\`. That is what stops the surface from marching.
 * Two waves at one frequency always translate rigidly — there is a velocity
 * that satisfies both phases, and if their directions differ it is a fast
 * sideways one, which is worse. Three directions over-determine it: no single
 * velocity carries the pattern, so it has to rise and fall in place instead.
 * At \`uRippleReflect\` 0 this collapses to the plain travelling train it
 * replaced, which is the bug it was written to fix.
 *
 * The domain drag on the last line is what stops a sum of sines looking like
 * plaid: each octave is evaluated in a space already pushed around by the ones
 * above it, so crests lean and interfere irregularly. It does cost the reported
 * gradient a chain-rule term, which is why \`chop\` is a separate knob and why
 * the gradient test pins it at zero.
 */
vec3 rippleField(vec2 p, float time, float agitation) {
  vec2  q      = p;
  vec2  dir    = uRippleDir;
  float k      = uRippleK0;
  float speed  = uRippleSpeed;
  float amp    = 1.0;
  float ampSum = 0.0;

  float h = 0.0;
  vec2  grad = vec2(0.0);

  mat2 turn = mat2(uRippleTurn.x, uRippleTurn.y, -uRippleTurn.y, uRippleTurn.x);
  mat2 backTurn = mat2(uRippleBackTurn.x, uRippleBackTurn.y,
                       -uRippleBackTurn.y, uRippleBackTurn.x);
  float mean = mix(0.5, RIPPLE_SHARP_MEAN, uRippleSteep);

  for (int i = 0; i < RIPPLE_MAX_OCTAVES; i++) {
    if (float(i) >= uRippleOctaves) break;

    // The glass is curved, so what comes back is spread rather than one
    // reversed ray. Two return legs, turned equally either side of the exact
    // reverse — three directions sharing one frequency, which is one more than
    // any single velocity can carry.
    vec2  reverse = -dir;
    vec2  backA   = backTurn * reverse;
    vec2  backB   = reverse * backTurn;   // v * m is the same turn, the other way
    float half_   = uRippleReflect * 0.5;

    float now   = time * speed + float(i) * RIPPLE_OCTAVE_TIME;
    float phase = float(i) * RIPPLE_OCTAVE_PHASE + now;

    vec2 out_ = rippleCrest(dot(dir, q) * k + phase, mean);
    vec2 retA = rippleCrest(dot(backA, q) * k + phase + RIPPLE_RETURN_PHASE, mean);
    vec2 retB = rippleCrest(dot(backB, q) * k + phase - RIPPLE_RETURN_PHASE, mean);

    // Height adds, but slope has to keep each leg pointing the way it travels.
    vec2 slope = dir * out_.y + (backA * retA.y + backB * retB.y) * half_;

    h    += (out_.x + (retA.x + retB.x) * half_) * amp;
    grad += slope * (k * amp);
    ampSum += amp * (1.0 + uRippleReflect);

    q     -= slope * (amp * uRippleChop / k);
    dir    = turn * dir;
    k     *= uRippleFreqStep;
    speed *= uRippleSpeedStep;
    amp   *= uRippleAmpStep;
  }

  float scale = uRippleAmp * mix(uRippleIdle, 1.0, clamp(agitation, 0.0, 1.0))
              / max(ampSum, 1e-6);
  return vec3(h * scale, grad * scale);
}

/** Upward surface normal. */
vec3 rippleNormal(vec2 p, float time, float agitation) {
  vec2 slope = rippleField(p, time, agitation).yz;
  return normalize(vec3(-slope.x, 1.0, -slope.y));
}
`;

export interface RippleUniforms {
  uRippleK0: { value: number };
  uRippleAmp: { value: number };
  uRippleIdle: { value: number };
  uRippleOctaves: { value: number };
  uRippleFreqStep: { value: number };
  uRippleAmpStep: { value: number };
  uRippleSpeed: { value: number };
  uRippleSpeedStep: { value: number };
  uRippleDir: { value: THREE.Vector2 };
  uRippleTurn: { value: THREE.Vector2 };
  uRippleSteep: { value: number };
  uRippleChop: { value: number };
  uRippleReflect: { value: number };
  uRippleBackTurn: { value: THREE.Vector2 };
}

export function createRippleUniforms(params: RippleParams = DEFAULT_RIPPLE): RippleUniforms {
  const uniforms: RippleUniforms = {
    uRippleK0: { value: 0 },
    uRippleAmp: { value: 0 },
    uRippleIdle: { value: 0 },
    uRippleOctaves: { value: 0 },
    uRippleFreqStep: { value: 0 },
    uRippleAmpStep: { value: 0 },
    uRippleSpeed: { value: 0 },
    uRippleSpeedStep: { value: 0 },
    uRippleDir: { value: new THREE.Vector2(1, 0) },
    uRippleTurn: { value: new THREE.Vector2(1, 0) },
    uRippleSteep: { value: 0 },
    uRippleChop: { value: 0 },
    uRippleReflect: { value: 0 },
    uRippleBackTurn: { value: new THREE.Vector2(1, 0) }
  };
  writeRippleUniforms(uniforms, params);
  return uniforms;
}

/** Push params into an existing uniform block. Allocates nothing, so it is safe per frame. */
export function writeRippleUniforms(uniforms: RippleUniforms, params: RippleParams): void {
  const baseAngle = (params.baseAngleDeg * Math.PI) / 180;
  const turn = (params.turnDeg * Math.PI) / 180;

  uniforms.uRippleK0.value = (2 * Math.PI) / Math.max(1e-4, params.wavelengthMm / 1000);
  uniforms.uRippleAmp.value = params.amplitudeMm / 1000;
  uniforms.uRippleIdle.value = params.idleFraction;
  uniforms.uRippleOctaves.value = Math.max(1, Math.min(RIPPLE_MAX_OCTAVES, params.octaves));
  uniforms.uRippleFreqStep.value = params.freqStep;
  uniforms.uRippleAmpStep.value = params.ampStep;
  uniforms.uRippleSpeed.value = params.speed;
  uniforms.uRippleSpeedStep.value = params.speedStep;
  uniforms.uRippleDir.value.x = Math.cos(baseAngle);
  uniforms.uRippleDir.value.y = Math.sin(baseAngle);
  uniforms.uRippleTurn.value.x = Math.cos(turn);
  uniforms.uRippleTurn.value.y = Math.sin(turn);
  uniforms.uRippleSteep.value = params.steepness;
  uniforms.uRippleChop.value = params.chop;
  uniforms.uRippleReflect.value = Math.max(0, Math.min(1, params.reflection));

  const backTurn = (params.reflectionTurnDeg * Math.PI) / 180;
  uniforms.uRippleBackTurn.value.x = Math.cos(backTurn);
  uniforms.uRippleBackTurn.value.y = Math.sin(backTurn);
}

export interface RippleSample {
  /** Height offset from flat, metres. */
  height: number;
  /** d(height)/dx, dimensionless. */
  slopeX: number;
  /** d(height)/dz, dimensionless. */
  slopeZ: number;
}

/**
 * The same field in TypeScript, kept line-for-line with the GLSL above.
 *
 * Nothing in the running scene calls this — the shader does the real work. It
 * exists so the tests can check the parts of the field that are true regardless
 * of how it looks.
 */
export function rippleAt(
  params: RippleParams,
  x: number,
  z: number,
  time: number,
  agitation: number
): RippleSample {
  const baseAngle = (params.baseAngleDeg * Math.PI) / 180;
  const turn = (params.turnDeg * Math.PI) / 180;
  const turnCos = Math.cos(turn);
  const turnSin = Math.sin(turn);
  const octaves = Math.max(1, Math.min(RIPPLE_MAX_OCTAVES, Math.floor(params.octaves)));
  const mean = 0.5 + (SHARP_MEAN - 0.5) * params.steepness;
  const reflect = Math.max(0, Math.min(1, params.reflection));
  const backTurn = (params.reflectionTurnDeg * Math.PI) / 180;
  const backCos = Math.cos(backTurn);
  const backSin = Math.sin(backTurn);

  /** Zero-mean crest profile and its phase derivative — `rippleCrest` in the GLSL. */
  const crest = (phase: number): [number, number] => {
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const sharp = Math.exp(s - 1);
    return [
      s * 0.5 + 0.5 + (sharp - (s * 0.5 + 0.5)) * params.steepness - mean,
      c * 0.5 + (sharp * c - c * 0.5) * params.steepness
    ];
  };

  let qx = x;
  let qz = z;
  let dirX = Math.cos(baseAngle);
  let dirZ = Math.sin(baseAngle);
  let k = (2 * Math.PI) / Math.max(1e-4, params.wavelengthMm / 1000);
  let speed = params.speed;
  let amp = 1;
  let ampSum = 0;

  let height = 0;
  let gradX = 0;
  let gradZ = 0;

  for (let i = 0; i < octaves; i++) {
    const aX = backCos * -dirX - backSin * -dirZ;
    const aZ = backSin * -dirX + backCos * -dirZ;
    const bX = backCos * -dirX + backSin * -dirZ;
    const bZ = -backSin * -dirX + backCos * -dirZ;
    const half = reflect * 0.5;

    const phase = i * OCTAVE_PHASE + time * speed + i * OCTAVE_TIME;

    const [outW, outD] = crest((dirX * qx + dirZ * qz) * k + phase);
    const [aW, aD] = crest((aX * qx + aZ * qz) * k + phase + RETURN_PHASE);
    const [bW, bD] = crest((bX * qx + bZ * qz) * k + phase - RETURN_PHASE);

    const slopeX = dirX * outD + (aX * aD + bX * bD) * half;
    const slopeZ = dirZ * outD + (aZ * aD + bZ * bD) * half;

    height += (outW + (aW + bW) * half) * amp;
    gradX += slopeX * (k * amp);
    gradZ += slopeZ * (k * amp);
    ampSum += amp * (1 + reflect);

    const drag = (amp * params.chop) / k;
    qx -= slopeX * drag;
    qz -= slopeZ * drag;

    const nextX = turnCos * dirX - turnSin * dirZ;
    dirZ = turnSin * dirX + turnCos * dirZ;
    dirX = nextX;

    k *= params.freqStep;
    speed *= params.speedStep;
    amp *= params.ampStep;
  }

  const clampedAgitation = Math.max(0, Math.min(1, agitation));
  const scale =
    ((params.amplitudeMm / 1000) *
      (params.idleFraction + (1 - params.idleFraction) * clampedAgitation)) /
    Math.max(1e-6, ampSum);

  return {
    height: height * scale,
    slopeX: gradX * scale,
    slopeZ: gradZ * scale
  };
}

/** How many full waves of the longest octave fit across a span, in metres. */
export function wavesAcross(params: RippleParams, spanMetres: number): number {
  return spanMetres / (params.wavelengthMm / 1000);
}
