import * as THREE from 'three';
import { TANK_HALF_X, TANK_HALF_Z } from './constants';

/**
 * The water surface, simulated rather than described.
 *
 * What was here before was a sum of sines — five octaves, each a plane wave with
 * a fixed direction and a fixed speed. It could be made to stand still and it
 * could be made irregular, but it could never stop looking like a pattern,
 * because it was one. Every wave in it existed everywhere on the water at once
 * and always had; nothing on the surface was ever a consequence of anything.
 *
 * This is the wave equation on a grid instead. Height and its previous value
 * live in the two channels of a texture, one step of
 *
 *   d2h/dt2 = c^2 * laplacian(h)
 *
 * runs per physics substep, and the surface shader reads slope out of it. The
 * things the old field had to fake are now free, because they are what the
 * equation does:
 *
 *   - Waves come back off the glass. The step clamps its neighbour lookups to
 *     the edge of the grid, which is a zero-gradient wall, which is a reflection.
 *     The jar rings the way a closed vessel rings.
 *   - Ripples interfere, and the interference is different everywhere, because
 *     it depends on what each part of the surface has been through.
 *   - The marimo bobbing, a bubble surfacing, a stir: all of them are just
 *     something pushing on the water, and the ripples that come off them spread,
 *     bounce and die on their own.
 *
 * The GLSL and the TypeScript below are the same stepper written twice, in the
 * same shape as `sphericalHarmonics.ts` and the field this replaces. The copy
 * buys tests that can assert the things a screenshot cannot — that it is stable,
 * that a pulse travels at the speed it was asked for, that the walls reflect,
 * and that still water is still.
 */

/** Cells across the jar. The interior is 110 x 90 mm, so these are square. */
export const RIPPLE_COLS = 176;
export const RIPPLE_ROWS = 144;

/** Cell pitch, metres. Square by construction — the laplacian below assumes it. */
export const RIPPLE_CELL = (TANK_HALF_X * 2) / RIPPLE_COLS;

/**
 * The step the scene drives this at, seconds. Matched to the motion clock's
 * substep rather than to the frame, so the CFL number below is a constant of the
 * build and not a property of how fast the machine happens to be drawing.
 */
export const RIPPLE_STEP_SEC = 1 / 240;

/**
 * Most things that can be pushing on the water at once: a few bubbles bursting,
 * the marimo, and a stir.
 */
export const RIPPLE_MAX_DROPS = 6;

export interface RippleSimParams {
  /**
   * How fast a ripple crosses the water, mm/s.
   *
   * Bounded by the grid, not by taste: an explicit wave equation is stable while
   * `c * dt / cell <= 1/sqrt(2)`, which at this pitch and step is 106 mm/s. Real
   * capillary ripples at these wavelengths run more than twice that, so this is
   * slowed for the same reason the old field's `speed` was — see `cflNumber`,
   * which is the number to watch, and the test that holds it under the limit.
   */
  speedMmPerSec: number;
  /** Seconds for undriven ripples to fall to 1/e. */
  decaySec: number;
  /**
   * How much faster short ripples die than long ones.
   *
   * Viscosity damps a wave in proportion to the square of its wavenumber, which
   * on a grid is a diffusion of the surface's velocity. Without it the shortest
   * thing the grid can hold — every other cell up, every other cell down — has
   * nothing to lose it to, and the water buzzes.
   */
  viscosity: number;
  /** Millimetres of relief the surface shader draws per millimetre of field. */
  reliefScale: number;
}

/**
 * Defaults.
 *
 * `speedMmPerSec` at 75 puts the CFL number at 0.5, half the stable limit. That
 * headroom is deliberate: it is what lets the scene fall behind and catch up
 * with a burst of substeps without the field exploding.
 *
 * `decaySec` is what a jar actually does. Stir it and the ripples are gone in a
 * few seconds, because a 100 mm dish has no room to hold a wave for long.
 *
 * Nothing here drives the water. A jar left alone damps to glass and stays
 * there, and a mirror-flat surface is the correct answer for a jar nobody is
 * touching. What makes ripples is what makes ripples in the real thing: a
 * bubble reaching the top and bursting, the marimo coming up, a stir.
 */
export const DEFAULT_RIPPLE_SIM: RippleSimParams = {
  speedMmPerSec: 75,
  decaySec: 4.5,
  viscosity: 0.012,
  reliefScale: 1
};

/**
 * Something pushing on the water. Positions and radius in metres.
 *
 * `strength` is a forcing, not a height: it is added to the surface every step,
 * so a source held at one sign is not a dent of that depth, it is a dent that
 * keeps getting deeper. There is no term in the wave equation pulling the
 * surface back to flat — the laplacian only spreads what is there — so nothing
 * balances a constant push except how fast it can run away, and at 240 steps a
 * second that is not fast enough.
 *
 * So sources have to alternate or to stop. Real ones do: the room shakes the
 * jar both ways, a marimo bobs up and then down, a stir slops the water from
 * side to side. It is only a made-up source that pushes one way for ever.
 */
export interface RippleDrop {
  x: number;
  z: number;
  radius: number;
  /** Millimetres per step, signed. See above: this must not hold one sign. */
  strength: number;
}

/**
 * Steps a bursting bubble goes on pushing for, and how they are split.
 *
 * Even, and split down the middle, because the two halves have to cancel. The
 * film lifts and then the cavity falls back in, and what a burst is *for* is the
 * ring that leaves behind — not a dimple. An odd count cannot be balanced: the
 * leftover half-cycle is a net impulse, which is a kernel-shaped dent that
 * nothing in the wave equation takes back, and every bubble in the jar adds
 * another one. Six at 240 Hz is a fortieth of a second, which is about how long
 * a millimetre bubble's cavity actually takes to close.
 */
export const RIPPLE_BURST_STEPS = 6;

/**
 * Millimetres of push per step, per millimetre of the bubble that made it.
 *
 * Bigger than it looks like it should be, because `rippleKernel` displaces no
 * net water, and a source that displaces none is a far quieter radiator than one
 * that invents some — most of what it emits cancels against its own ring before
 * it gets anywhere.
 *
 * Measured on the twin stepper across the range the jar actually makes, a tenth
 * of a second after the bubble goes: the smallest leaves a ring of 0.04 mm, a
 * middling one 0.10 mm, and the rare big one 0.34 mm. All of them are gone
 * inside a second, because a ring that tight is short wavelength and viscosity
 * takes those first. That puts even the loudest burst well under a deliberate
 * stir, which is the right order: fizz is something you notice, a stir is
 * something you did.
 */
export const RIPPLE_BURST_PUSH = 0.5;

/** How much wider than the bubble the ring it leaves is. */
export const RIPPLE_BURST_SPREAD = 2.5;

/**
 * Smallest ring the grid is allowed to be asked for, in cells.
 *
 * A kernel narrower than a couple of cells is not a small ripple, it is a lone
 * bright texel: the sampling misses the ring that is supposed to cancel the
 * core, so the source stops being volume-neutral and starts being a spike for
 * the laplacian to ring on. Most of the jar's bubbles are under a cell across,
 * so without this most of the jar's bubbles are that spike.
 *
 * It floors the ring only. What a burst is *worth* comes from the bubble's own
 * radius, so a small bubble drawn at the grid's smallest ring is still a quiet
 * one — which is the whole spread this used to have and lost when the floor was
 * applied to the strength as well.
 */
export const RIPPLE_BURST_MIN_CELLS = 2.5;

/**
 * The push a bursting bubble makes on step `stepsLeft` of its life, counting
 * down from `RIPPLE_BURST_STEPS`. Radius in metres, as the bubbles carry it.
 *
 * One place, because the jar and the bench both raise bursts and a burst that
 * behaves differently in the bench is a bench that cannot be used to tune it.
 */
export function burstDrop(
  x: number,
  z: number,
  radius: number,
  stepsLeft: number,
  cell = RIPPLE_CELL
): RippleDrop {
  const lifting = stepsLeft > RIPPLE_BURST_STEPS / 2;
  return {
    x,
    z,
    radius: Math.max(radius * RIPPLE_BURST_SPREAD, cell * RIPPLE_BURST_MIN_CELLS),
    strength: (lifting ? 1 : -1) * radius * 1000 * RIPPLE_BURST_PUSH
  };
}

/**
 * Courant number for a set of parameters: `c * dt / cell`.
 *
 * The explicit scheme is stable below `1/sqrt(2)` in two dimensions and blows up
 * above it, so this is the single number that decides whether the sim is a sim
 * or a screenful of NaN. Exported because the bench shows it and a test pins it.
 */
export function cflNumber(params: RippleSimParams, cell = RIPPLE_CELL): number {
  return ((params.speedMmPerSec / 1000) * RIPPLE_STEP_SEC) / cell;
}

export const RIPPLE_CFL_LIMIT = Math.SQRT1_2;

/**
 * Seconds for the field as a whole to fall to 1/e, whatever it is doing.
 *
 * A last resort, and only that. `rippleKernel` is zero-volume analytically, so
 * in exact arithmetic the water line never moves and this is never needed — but
 * the kernel is sampled onto a grid, and what a grid gives back is zero plus a
 * rounding error, every time a source fires. That residue is the one thing the
 * damping cannot otherwise touch, so it would accumulate for as long as the tab
 * stayed open.
 *
 * Applied by scaling the whole state, both channels together, which is a plain
 * exponential envelope on the field and leaves the dynamics inside it alone.
 * Damping the height on its own would not: it would show up in the next step's
 * velocity as motion that nothing physical caused.
 *
 * Long enough against `decaySec` that ripples are gone on their own account well
 * before this has done anything to them.
 */
export const RIPPLE_LEVEL_TAU = 8;

/** The four coefficients the stepper actually runs on. */
export interface RippleCoefficients {
  /** `(c dt / cell)^2`, the weight on the laplacian. */
  wave: number;
  /** Fraction of the surface's velocity lost each step. */
  drag: number;
  /** Diffusion of that velocity, which is the wavenumber-squared damping. */
  viscosity: number;
  /** What is left of the whole field after a step. See `RIPPLE_LEVEL_TAU`. */
  levelKeep: number;
}

export function rippleCoefficients(
  params: RippleSimParams,
  cell = RIPPLE_CELL
): RippleCoefficients {
  return {
    wave: cflNumber(params, cell) ** 2,
    drag: RIPPLE_STEP_SEC / Math.max(1e-3, params.decaySec),
    viscosity: params.viscosity,
    levelKeep: 1 - RIPPLE_STEP_SEC / RIPPLE_LEVEL_TAU
  };
}

/**
 * How a source is spread over the water — the TypeScript twin of `rippleKernel`
 * in the GLSL above, where the reasoning for its shape is written down.
 */
export function rippleKernel(t: number): number {
  const bump = 1 - t * t;
  return bump * bump * (1 - 4 * t * t);
}

export const RIPPLE_STEP_GLSL = /* glsl */ `
precision highp float;

uniform sampler2D uState;   // .r height now, .g height one step ago, millimetres
uniform vec2  uTexel;
uniform float uWave;
uniform float uDrag;
uniform float uViscosity;
uniform vec4  uDrops[${RIPPLE_MAX_DROPS}];  // xy centre in uv, z radius in uv, w millimetres
uniform float uLevelKeep;

varying vec2 vUv;

/**
 * How a source is spread over the water: a core that lifts, and a ring around it
 * that makes room for the lift.
 *
 * It integrates to exactly zero over the disc, and that is the whole point. The
 * jar is closed and full — nothing that happens on the surface adds water to it.
 * A bubble bursting, a marimo rising, a stir: every one of them moves water
 * about, and a kernel that is positive everywhere quietly invents some each time
 * it fires. Nothing takes it away again either, because with a wall all the way
 * round, the wave equation conserves volume exactly: the mean of the field is
 * the one thing in here that the damping cannot reach, since a level surface has
 * no velocity to drag on and no curvature to spread.
 *
 * Left as it was, every disturbance nudged the water line and it never came
 * back. Four minutes of ordinary fizz moved it a twentieth of a millimetre, an
 * hour would have moved it most of one, and the ripples riding on top of the
 * drift steadily lost the float precision to be seen properly — which showed up
 * as a shimmer that would not settle.
 *
 * Smooth to first order at the rim, so a source that moves does not leave a step
 * behind it for the laplacian to ring on.
 */
float rippleKernel(float t) {
  float bump = 1.0 - t * t;
  return bump * bump * (1.0 - 4.0 * t * t);
}

/**
 * The wall.
 *
 * Clamping the lookup to the last texel centre makes the cell outside the grid a
 * copy of the cell inside it, so the height gradient across the boundary is
 * zero. That is a rigid wall, and a rigid wall reflects. It is the whole of the
 * jar's glass, in one clamp.
 */
vec2 fetch(vec2 uv) {
  return texture2D(uState, clamp(uv, uTexel * 0.5, 1.0 - uTexel * 0.5)).rg;
}

void main() {
  vec2 c = fetch(vUv);
  vec2 l = fetch(vUv - vec2(uTexel.x, 0.0));
  vec2 r = fetch(vUv + vec2(uTexel.x, 0.0));
  vec2 d = fetch(vUv - vec2(0.0, uTexel.y));
  vec2 u = fetch(vUv + vec2(0.0, uTexel.y));

  // Laplacian of the height, and of the velocity that the viscous term needs.
  float lapNow  = l.r + r.r + d.r + u.r - 4.0 * c.r;
  float lapPrev = l.g + r.g + d.g + u.g - 4.0 * c.g;

  float velocity = (c.r - c.g) * (1.0 - uDrag);
  float next = c.r + velocity + uWave * lapNow + uViscosity * (lapNow - lapPrev);

  for (int i = 0; i < ${RIPPLE_MAX_DROPS}; i++) {
    vec4 drop = uDrops[i];
    if (drop.z > 0.0) {
      float t = clamp(length((vUv - drop.xy) / drop.z), 0.0, 1.0);
      next += drop.w * rippleKernel(t);
    }
  }

  // The whole state, scaled together. See RIPPLE_LEVEL_TAU.
  gl_FragColor = vec4(next, c.r, 0.0, 1.0) * uLevelKeep;
}
`;

export interface RippleField {
  cols: number;
  rows: number;
  /** Height, millimetres. */
  now: Float32Array;
  /** Height one step ago. */
  prev: Float32Array;
}

export function createRippleField(cols = RIPPLE_COLS, rows = RIPPLE_ROWS): RippleField {
  return {
    cols,
    rows,
    now: new Float32Array(cols * rows),
    prev: new Float32Array(cols * rows)
  };
}

/**
 * The same step in TypeScript, kept line-for-line with the GLSL above.
 *
 * Nothing in the running scene calls this — the GPU does the real work. It
 * exists so the tests can drive the field and watch what it does.
 */
export function stepRippleField(
  field: RippleField,
  coefficients: RippleCoefficients,
  drops: RippleDrop[] = [],
  cell = RIPPLE_CELL
): void {
  const { cols, rows, now, prev } = field;
  const next = prev; // The old previous is about to be overwritten anyway.

  const at = (a: Float32Array, i: number, j: number) =>
    a[Math.min(rows - 1, Math.max(0, j)) * cols + Math.min(cols - 1, Math.max(0, i))];

  const spanX = cols * cell;
  const spanZ = rows * cell;

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v = j * cols + i;
      const cNow = now[v];
      const cPrev = prev[v];

      const lapNow =
        at(now, i - 1, j) + at(now, i + 1, j) + at(now, i, j - 1) + at(now, i, j + 1) - 4 * cNow;
      const lapPrev =
        at(prev, i - 1, j) +
        at(prev, i + 1, j) +
        at(prev, i, j - 1) +
        at(prev, i, j + 1) -
        4 * cPrev;

      const velocity = (cNow - cPrev) * (1 - coefficients.drag);
      let value =
        cNow + velocity + coefficients.wave * lapNow + coefficients.viscosity * (lapNow - lapPrev);

      for (const drop of drops) {
        if (drop.radius <= 0) continue;
        const dx = (i + 0.5) * cell - spanX / 2 - drop.x;
        const dz = (j + 0.5) * cell - spanZ / 2 - drop.z;
        const t = Math.min(1, Math.hypot(dx, dz) / drop.radius);
        value += drop.strength * rippleKernel(t);
      }

      next[v] = value * coefficients.levelKeep;
    }
  }

  // Both channels scaled together, so the envelope is the only thing it does.
  for (let i = 0; i < now.length; i++) now[i] *= coefficients.levelKeep;

  field.prev = now;
  field.now = next;
}

/** Root-mean-square height over the whole field, millimetres. */
export function rippleRms(field: RippleField): number {
  let total = 0;
  for (let i = 0; i < field.now.length; i++) total += field.now[i] * field.now[i];
  return Math.sqrt(total / field.now.length);
}

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export interface RippleSim {
  /** The state texture the surface shader samples. */
  readonly texture: THREE.Texture;
  readonly cols: number;
  readonly rows: number;
  setParams(params: RippleSimParams): void;
  /** Run `count` steps, with `drops` pushing on the water throughout. */
  step(renderer: THREE.WebGLRenderer, count: number, drops: RippleDrop[]): void;
  /** Flatten the water — a fresh jar, or a tab that has been away for a month. */
  reset(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
}

/**
 * Full float, and it has to be.
 *
 * Half was the obvious choice and it is wrong here, for a reason that has
 * nothing to do with how big the heights are. What this scheme does per step is
 * multiply the state by numbers very close to one: the velocity keeps
 * `1 - 9.3e-4` of itself, the field keeps `1 - 5.2e-4`. A half's relative
 * spacing is `4.9e-4`. Both of those factors are the same size as the gap
 * between one representable number and the next, so the multiply rounds back to
 * where it started more often than not, and the damping simply does not happen —
 * the water rings for ever.
 *
 * The viscous term is worse: it is `lapNow - lapPrev`, a difference between two
 * nearly equal small numbers, which at half precision is mostly the subtraction
 * of one rounding error from another.
 *
 * Measured, not assumed: at float32 the field settles to a slope of 1e-12 after
 * thirty untouched seconds, and at half it stops at 1e-5 and stays there.
 * `rippleSim.test.ts` holds both ends of that.
 *
 * Two targets at this size cost under a megabyte together, so there was never
 * anything to save. Heights stay in millimetres regardless — it costs nothing
 * and keeps the numbers readable in a debugger.
 *
 * Linear filtering is on because the surface shader samples this at whatever
 * resolution the water happens to cover; the step pass needs texel-exact reads
 * and gets them anyway, drawing one-to-one.
 */
function createTarget(cols: number, rows: number, type: THREE.TextureDataType) {
  return new THREE.WebGLRenderTarget(cols, rows, {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false
  });
}

export function createRippleSim(
  renderer: THREE.WebGLRenderer,
  params: RippleSimParams = DEFAULT_RIPPLE_SIM,
  cols = RIPPLE_COLS,
  rows = RIPPLE_ROWS
): RippleSim {
  // Rendering to a 32-bit float target needs this in WebGL2. It is close to
  // universal, but where it is missing the choice is half or nothing, and half
  // is at least still water with the damping half-working rather than a blank
  // surface. See `createTarget` for what is lost.
  const floatTargets = renderer.getContext().getExtension('EXT_color_buffer_float') !== null;
  const type = floatTargets ? THREE.FloatType : THREE.HalfFloatType;

  let targets = [createTarget(cols, rows, type), createTarget(cols, rows, type)];
  let front = 0;

  const dropUniform: THREE.Vector4[] = Array.from(
    { length: RIPPLE_MAX_DROPS },
    () => new THREE.Vector4(0, 0, 0, 0)
  );

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uState: { value: targets[0].texture },
      uTexel: { value: new THREE.Vector2(1 / cols, 1 / rows) },
      uWave: { value: 0 },
      uDrag: { value: 0 },
      uViscosity: { value: 0 },
      uLevelKeep: { value: 1 },
      uDrops: { value: dropUniform }
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: RIPPLE_STEP_GLSL,
    depthTest: false,
    depthWrite: false
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let coefficients = rippleCoefficients(params);

  function writeCoefficients() {
    material.uniforms.uWave.value = coefficients.wave;
    material.uniforms.uDrag.value = coefficients.drag;
    material.uniforms.uViscosity.value = coefficients.viscosity;
    material.uniforms.uLevelKeep.value = coefficients.levelKeep;
  }
  writeCoefficients();

  const spanX = cols * RIPPLE_CELL;
  const spanZ = rows * RIPPLE_CELL;

  function writeDrops(drops: RippleDrop[]) {
    for (let i = 0; i < RIPPLE_MAX_DROPS; i++) {
      const drop = drops[i];
      if (!drop || drop.radius <= 0) {
        dropUniform[i].set(0, 0, 0, 0);
        continue;
      }
      dropUniform[i].set(
        drop.x / spanX + 0.5,
        drop.z / spanZ + 0.5,
        drop.radius / spanX,
        drop.strength
      );
    }
  }

  return {
    get texture() {
      return targets[front].texture;
    },
    cols,
    rows,

    setParams(next) {
      coefficients = rippleCoefficients(next);
      writeCoefficients();
    },

    step(renderer, count, drops) {
      if (count <= 0) return;
      writeDrops(drops);

      const previousTarget = renderer.getRenderTarget();
      for (let n = 0; n < count; n++) {
        const back = 1 - front;
        material.uniforms.uState.value = targets[front].texture;
        renderer.setRenderTarget(targets[back]);
        renderer.render(quadScene, quadCamera);
        front = back;
      }
      renderer.setRenderTarget(previousTarget);
    },

    reset(renderer) {
      const previousTarget = renderer.getRenderTarget();
      const previousClear = new THREE.Color();
      renderer.getClearColor(previousClear);
      const previousAlpha = renderer.getClearAlpha();
      renderer.setClearColor(0x000000, 1);
      for (const target of targets) {
        renderer.setRenderTarget(target);
        renderer.clear(true, false, false);
      }
      renderer.setClearColor(previousClear, previousAlpha);
      renderer.setRenderTarget(previousTarget);
    },

    dispose() {
      for (const target of targets) target.dispose();
      targets = [];
      quad.geometry.dispose();
      material.dispose();
    }
  };
}
