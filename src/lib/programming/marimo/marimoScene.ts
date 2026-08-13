import * as THREE from 'three';
import {
  FACET_MAX_DEPTH,
  FACET_MIN_DEPTH,
  FILAMENT_COUNT_AMBIENT,
  FILAMENT_COUNT_FULL,
  FILAMENT_FLOW_DAMPING,
  FILAMENT_FLOW_OMEGA,
  FILAMENT_FLOW_STEP_SEC,
  FILAMENT_LENGTH_FRAC,
  FLOOR_MU_ROLL,
  FLOOR_Y,
  MAX_FACETS,
  OMEGA_REF,
  SPIN_FRICTION_COEF,
  STONE_MAX_IN_TANK,
  SWIRL_MAX_OMEGA,
  TANK_HALF_X,
  TANK_HALF_Z,
  VENT_THRESHOLD,
  WATER_CHANGE_MIN_FOULING,
  WATER_Y
} from './constants';
import { applySqueeze, applyWaterChange, clamp, shapeOf } from './careSim';
import { deepestFacet, newShape } from './facets';
import { SH_COUNT } from './sphericalHarmonics';
import { catchUpToNow } from './catchUp';
import {
  bodyToWorld,
  contactGrip,
  effectiveDensity,
  neutralGas,
  newBody,
  spinDragRate,
  spinMagnitude,
  worldToBody,
  type BodyEnv
} from './buoyancy';
import { createMarimoMesh, type MarimoMeshBundle } from './marimoMesh';
import { offscreenMarker, type OffscreenMarker } from './offscreen';
import { createParticles, type ParticleBundle } from './particles';
import type { BubbleHandle, ScreenProjector } from './bubbleMesh';
import { flushMarimo, loadMarimo, saveMarimo } from './persist';
import { createRoom, type RoomBundle } from './roomMesh';
import {
  createStones,
  measureStone,
  spawnHeight,
  type PopOrigin,
  type StoneBundle,
  type StoneSplash
} from './stoneMesh';
import { createJoltWorld, type JoltBody, type JoltWorld } from './joltWorld';
import { findPlacement, restingY, type PlacedStone, type Stone } from './stones';
import { mulberry32 } from './rng';
import { newSwirl, stepSwirl, stirSwirl, waterSpinAt, waterVelocityAt } from './swirl';
import { createTank, mirrorCameraMatrix, type TankBundle } from './tankMesh';
import {
  DEFAULT_RIPPLE_SIM,
  RIPPLE_BURST_STEPS,
  burstDrop,
  createRippleSim,
  type RippleDrop,
  type RippleSim
} from './rippleSim';
import {
  applyLighting,
  createLightUniforms,
  createRoomUniforms,
  createWaterUniforms,
  waterCoefficients
} from './waterShader';
import {
  DEFAULT_LIGHT_LEVEL,
  DEFAULT_LIGHT_SOURCE_ID,
  DEFAULT_ROOM_TONE,
  resolveLighting,
  roomToneById,
  type ResolvedLighting
} from './lighting';
import type Jolt from 'jolt-physics';
import type { CatchUpResult, MarimoState } from './types';

/**
 * The whole tank: renderer, meshes, the motion clock, and the bridge to the
 * care clock.
 *
 * Shaped like `../candle-flame/candleScene.ts` — a plain factory returning an
 * interface, owning no Svelte state. The host component drives it with a RAF
 * loop and reads back a snapshot for the UI.
 */

const SIM_STEP_SEC = 1 / 240;
const MAX_SIM_SUBSTEPS = 64;
const CARE_TICK_SEC = 1;

/**
 * Window the FPS readout counts over. Half a second is stable enough to sit
 * still at a steady rate while staying quicker than the eye, and the panel only
 * repaints four times a second anyway.
 */
const FPS_WINDOW_SEC = 0.5;
/** Gaps longer than this are a paused loop resuming, not a slow frame. */
const FPS_DISCONTINUITY_SEC = 0.5;

/** Framing pulls back as the marimo grows, so it stays a similar size on screen. */
const CAMERA_BASE_DISTANCE = 0.098;
const CAMERA_DISTANCE_PER_RADIUS = 4.2;
/** The camera drifts to follow the ball up and down rather than snapping. */
const CAMERA_FOLLOW_TAU = 0.9;
/*
 * The marimo's grab spring now lives in `joltWorld.ts` along with the stones',
 * because a hand pulling on something is the same hand whatever it has hold of.
 */
const REST_DIR_TAU = 30;
const TUMBLE_OMEGA = 3.2;

/**
 * How hard a grown-in flat face pulls the marimo down onto itself, rad/s².
 *
 * The one thing about the pet's shape the physics cannot see. It collides as a
 * sphere — rebuilding a hull for a shape that changes over weeks would be
 * absurd — so "a flat side is a stable place to lie" has to be said out loud.
 *
 * An angular acceleration, not a torque, and the distinction has already cost
 * one bug: this number was once handed to the engine as newton-metres, where —
 * against the marimo's true inertia of a few times 10⁻⁷ kg·m² — it was a
 * restoring spring ringing in the kilohertz, and the pet rocked on the gravel
 * forever. `joltWorld.addTorque` now takes rad/s² and converts through the
 * body's own inertia, so the number means the same thing whatever it is
 * applied to.
 *
 * At 26 rad/s² the restoring frequency is √26 ≈ 5 rad/s: it noses onto its
 * face in about a second, which is what the old hand-rolled contact model
 * produced from friction and was right.
 */
const FACET_SETTLE_ACCEL = 26;

/**
 * Damping on that same settle, 1/s, applied against the horizontal spin.
 *
 * `2·√26 ≈ 10` is critical damping for the spring above at a full-depth facet.
 * The water's own angular drag is 0.6/s and cannot be the thing that stops a
 * rocking ball — without this the settle is a pendulum that swings for ten
 * seconds, and the gravel the old model rocked against is not simulated.
 */
const FACET_SETTLE_DAMPING = 10;

/**
 * Cap on the rolling-resistance rate, 1/s.
 *
 * The resistance itself is Coulomb — a fixed angular deceleration, which is
 * what makes it a friction law: under it the ball is not slowing down, it has
 * stopped. But a constant deceleration expressed as a torque flip-flops across
 * zero at the step rate once the spin is nearly gone, so near zero it turns
 * viscous instead. At 30/s the crossover is far below anything visible, and
 * `rate·dt` stays a safe eighth.
 */
const ROLL_RATE_CAP = 30;

/** m/s of overturning added per unit of vertical pointer travel, in NDC. */
const STIR_VERTICAL_GAIN = 0.025;

const DRAIN_SEC = 1.2;
const REFILL_SEC = 1.5;

/** The lamp and room the scene was authored under, for callers with no preference. */
const DEFAULT_LIGHTING: ResolvedLighting = resolveLighting({
  lightSource: DEFAULT_LIGHT_SOURCE_ID,
  lightLevel: DEFAULT_LIGHT_LEVEL,
  roomTone: DEFAULT_ROOM_TONE
});

export type SceneVariant = 'full' | 'ambient';
export type SceneDetail = 'full' | 'reduced';

export interface MarimoSnapshot {
  state: MarimoState;
  displayFps: number;
  grabbing: boolean;
  waterChanging: boolean;
  canChangeWater: boolean;
  /** Set once the marimo starts leaving the frame; null while it is in shot. */
  offscreen: OffscreenMarker | null;
}

export interface MarimoScene {
  renderer: THREE.WebGLRenderer;
  resize(): void;
  render(timeMs: number): MarimoSnapshot;
  dispose(): void;

  /** Pointer positions are normalised device coords in [-1, 1]. */
  pointerDown(nx: number, ny: number, orbit: boolean): void;
  pointerMove(nx: number, ny: number): void;
  pointerUp(): void;

  waterChange(): void;
  tumble(): void;
  stir(): void;
  squeeze(): void;
  /**
   * Take hold of the marimo from wherever it is, without the pointer having to
   * be on it — for reaching a ball that has left the frame. From there it is an
   * ordinary grab: `pointerMove` and `pointerUp` carry it on.
   */
  grabAt(nx: number, ny: number): void;
  /** Bring the pet up to date and write it out now, for pagehide and tab-hide. */
  flush(): void;
  /** Damp or undamp the motion without rebuilding anything. */
  setReducedMotion(reduced: boolean): void;

  /**
   * Drop a stone in, from a sticker that was let go at `nx`, `ny`.
   *
   * Null coordinates mean the sticker was pressed rather than dragged, so there
   * is nowhere in particular it was aimed; the jar picks a clear spot.
   *
   * `stickerRadiusPx` is how big the sticker's stone was on screen at the moment
   * it was released, which is what the pop starts from — the stone appears at
   * exactly the size the picture was and grows or shrinks into the jar as it
   * turns solid. Null there means no pop, which is what reduced motion gets.
   *
   * Returns the stone as placed, or null if the jar is full.
   */
  dropStone(
    stone: Stone,
    nx: number | null,
    ny: number | null,
    stickerRadiusPx: number | null
  ): PlacedStone | null;
  /** Take one back out. */
  removeStone(id: number): boolean;
  /** Everything in the jar, in the order it went in. */
  stones(): PlacedStone[];
  /** Empty it. */
  clearStones(): void;
  /**
   * Change the bulb, the dimmer, or the room. Live: every value it touches is a
   * uniform or the clear colour, so nothing is rebuilt and nothing about the
   * pet is disturbed.
   */
  setLighting(lighting: ResolvedLighting): void;

  /** Advance the pet's clock by hand. Dev only — uses the production path. */
  timeTravel(ms: number): CatchUpResult;
  /** The "while you were away" result from load, consumed once. */
  takeArrivalResult(): CatchUpResult | null;
}

export interface MarimoSceneOptions {
  /**
   * The physics engine, already loaded.
   *
   * Required, and taken rather than loaded here, because it is two megabytes of
   * WebAssembly behind a promise and a scene factory that returned one would
   * make every caller async for the sake of one dependency. The host waits for
   * it once and hands it over. See `loadJolt`.
   */
  jolt: typeof Jolt;
  variant?: SceneVariant;
  reducedMotion?: boolean;
  /**
   * Strand count. Fixed at construction because the filament buffers are built
   * once and never rebuilt — changing it means a new scene.
   */
  detail?: SceneDetail;
  /**
   * The marimo to open with, for a pet that was just chosen rather than loaded.
   * Omitted, the scene loads the stored one or hatches a default.
   */
  startWith?: MarimoState;
  /** Which bulb is in the lamp and how far up it is turned. */
  lighting?: ResolvedLighting;
  /** Stones already in the jar, restored from storage. They do not fall in. */
  stones?: readonly PlacedStone[];
  /**
   * Called whenever what is in the jar changes — including when a dropped stone
   * finally stops moving, which is the point at which where it *is* stops being
   * where it was aimed. The host writes it down.
   */
  onStonesChanged?: (stones: PlacedStone[]) => void;
}

/**
 * How many filaments this scene draws.
 *
 * The reduced setting is the same count the embedded tank uses, which is what
 * it is for — a coat that still reads as a coat on a machine that cannot afford
 * sixteen thousand strands.
 */
export function filamentCountFor(variant: SceneVariant, detail: SceneDetail): number {
  return variant === 'full' && detail === 'full' ? FILAMENT_COUNT_FULL : FILAMENT_COUNT_AMBIENT;
}

export function createMarimoScene(
  container: HTMLElement,
  options: MarimoSceneOptions
): MarimoScene {
  const variant = options.variant ?? 'full';
  const detail = options.detail ?? 'full';
  let reducedMotion = options.reducedMotion ?? false;
  let lighting = options.lighting ?? DEFAULT_LIGHTING;
  // Reduced motion damps how far the water can be thrown about; it does not stop
  // the simulation, since the pet still has to live its life.
  let motionScale = reducedMotion ? 0.35 : 1;

  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.005, 3);
  /** Half the frustum's height per unit of depth. The FOV never changes. */
  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

  let azimuth = 0.12;
  /**
   * Pitch tilts the look direction instead of orbiting the camera, so the view
   * can reach the waterline without the camera climbing over the jar or
   * burrowing into the gravel.
   *
   * The range is tight on purpose. This is a jar on a desk seen from outside,
   * not a diver in a lake: past a shallow angle the view simply leaves the top
   * of the glass and stares at nothing. It also means Snell's window — the cone
   * of sky visible through a water surface — is essentially never in shot, since
   * reaching it needs an eye underneath the surface looking steeply up. What is
   * available from out here is the far more common sight: the underside of the
   * surface at a grazing angle, past the critical angle, acting as a mirror.
   */
  let pitchOffset = 0.008;
  let cameraTargetY = 0;
  let cameraDistance = 0.12;
  // Animated during a water change; the camera and the water volume both read it.
  let waterLevel = WATER_Y;

  const CAMERA_ELEVATION = 0.006;
  const PITCH_MIN = -0.02;
  const PITCH_MAX = 0.05;

  /**
   * How far under the waterline the camera has to stay.
   *
   * This is the number that decides whether the surface is visible at all, and
   * it is not obvious. The surface is a horizontal plane, so how much of the
   * frame it fills depends only on the angle the eye makes with it — which is
   * set by the camera's *height*, not by where it is pointed. Pitch cannot
   * substitute: tilting up slides the surface down the frame while leaving it
   * exactly as thin.
   *
   * At 8 mm under, with the marimo floated up and the camera rising to follow
   * it, the water plane covers under 6% of the frame height — a bright seam,
   * edge-on, with no room for a ripple to read. Holding the camera 30 mm down
   * puts it over 20%, which is the difference between "there is a surface up
   * there" and a surface you can actually watch move.
   *
   * It only bites in the top half of the water column; with the marimo resting
   * on the gravel the camera is already below this and the framing is unchanged.
   */
  const CAMERA_MIN_DEPTH = 0.03;

  /** Never let the camera sink into the gravel, whatever the waterline is doing. */
  const CAMERA_FLOOR_MARGIN = 0.012;

  function cameraHeight(): number {
    // Stay under the waterline. The shader handles a camera above it, but the
    // crossing is a hard visual cut and the view from below is the good one.
    const underWater = Math.min(cameraTargetY + CAMERA_ELEVATION, waterLevel - CAMERA_MIN_DEPTH);
    // A water change animates the waterline all the way down to the floor, and
    // "stay under it" then asks for a camera below the gravel. The waterline
    // stops being the binding constraint once there is no water left.
    return Math.max(underWater, FLOOR_Y + CAMERA_FLOOR_MARGIN);
  }

  function placeCamera() {
    const r = cameraDistance;
    camera.position.set(r * Math.sin(azimuth), cameraHeight(), r * Math.cos(azimuth));
    camera.lookAt(0, cameraTargetY + pitchOffset, 0);
  }

  // ------------------------------------------------------------------- state
  const loaded = options.startWith
    ? { state: options.startWith, hatched: true }
    : loadMarimo(Date.now());
  const state = loaded.state;
  let arrivalResult: CatchUpResult | null = loaded.hatched ? null : catchUpToNow(state, Date.now());

  // Commit a newly hatched marimo straight away. Waiting for the first debounced
  // save leaves a couple of seconds in which closing the tab loses the pet, and
  // the visitor gets a different one next time without ever knowing why.
  if (loaded.hatched) flushMarimo(state);

  // ------------------------------------------------------------------ meshes
  const water = createWaterUniforms();
  const room = createRoomUniforms();
  const light = createLightUniforms();

  /**
   * Push the current lighting at everything that answers to it.
   *
   * The clear colour goes with the rest because it is the room too, just the
   * part of it that is painted before any geometry is: it is only ever seen for
   * the first frame or two, before the backdrop shell goes down, and it has to
   * be the colour the room settles at or a slow first paint flashes.
   */
  function applyCurrentLighting() {
    applyLighting({ water, room, light }, lighting);
    renderer.setClearColor(roomToneById(lighting.tone).backdrop, 1);
  }

  // Before anything is built, so the first frame is already lit the way the
  // visitor left it rather than flashing the default bulb for one frame.
  applyCurrentLighting();
  const surroundings: RoomBundle = createRoom(water, room);
  const tank: TankBundle = createTank(water, state.seed, room, light);
  const marimo: MarimoMeshBundle = createMarimoMesh({
    filamentCount: filamentCountFor(variant, detail),
    seed: state.seed,
    water,
    light
  });
  /**
   * Everything reduced motion touches, in one place so it can be changed live.
   *
   * The sway is damped; the water is switched off outright. A ripple is not a
   * large movement to begin with — what it is is a fast one, spread across the
   * whole surface, and damping it leaves the same flicker at a smaller
   * amplitude. Flat glass is the honest answer, and it is one the surface
   * shader already knows how to draw: it is what a jar looks like on a context
   * that would not give the simulation its render targets.
   */
  function applyMotionPreference() {
    motionScale = reducedMotion ? 0.35 : 1;
    marimo.setSwayScale(motionScale);
  }
  applyMotionPreference();
  const particles: ParticleBundle = createParticles(water, room, light, marimo.colour);
  /**
   * The jar as Jolt sees it. Everything solid in the tank is a body in here:
   * the glass, the gravel bed, every stone, and the marimo itself.
   */
  const world: JoltWorld = createJoltWorld(options.jolt);
  const stones: StoneBundle = createStones(water, light, world);
  stones.setReducedMotion(reducedMotion);

  /** Whether anything was still arriving last frame. See `stepStones`. */
  let stonesBusy = false;
  /** Ids are per-tank and never reused, so a removal cannot hit the wrong rock. */
  let nextStoneId = 1;
  /** Kept alongside the bundle so the hot path can skip an empty jar entirely. */
  let stoneCount = 0;
  for (const placed of options.stones ?? []) {
    stones.add(placed);
    nextStoneId = Math.max(nextStoneId, placed.id + 1);
  }
  stoneCount = stones.contents().length;

  scene.add(surroundings.group);
  scene.add(tank.group);
  scene.add(marimo.group);
  scene.add(stones.group);
  scene.add(particles.group);

  // ------------------------------------------------------------------ motion
  const body = newBody();
  const swirl = newSwirl();
  // The surface is derived from `bias` + `facets` + `dent` + `restDir` each
  // step, never stored. One scratch, reused by the physics and the shader.
  const shapeScratch = shapeOf(state, newShape(new Array<number>(SH_COUNT), MAX_FACETS + 1));

  // Position is not persisted: it is re-derived from buoyancy, which reads as
  // "it moved while you were gone" without storing anything.
  body.position[1] =
    state.gas > neutralGas() ? WATER_Y - state.radiusMm / 1000 : FLOOR_Y + state.radiusMm / 1000;

  const env: BodyEnv = {
    radiusM: state.radiusMm / 1000,
    gas: state.gas,
    shape: shapeScratch,
    waterVel: [0, 0, 0],
    waterOmegaY: 0,
    waterY: WATER_Y
  };

  /**
   * The marimo, as a body in the same world as the stones.
   *
   * This is the part that had to change to make any of the rest of it honest. It
   * used to have its own integrator, its own boundary clamps and its own model
   * of rolling on gravel, and a stone could only ever be a special case bolted
   * onto the side of that. As a sphere in Jolt it is simply another thing in the
   * jar: it rests on rocks because rocks are solid, it rolls because contacts
   * have friction, and a stone shoves it because that is what happens when one
   * solid hits another. None of those three behaviours is written down anywhere
   * any more.
   *
   * What is *not* Jolt's is everything a jar of water does not decide: the hand,
   * the pull toward a flat face it has grown, the tumble button. Those are
   * applied as forces and torques, which is what they are.
   */
  const marimoHandle: JoltBody | null = world.addMarimo(env.radiusM, body.position);
  const poseQuaternion = new THREE.Quaternion();
  const tipQuaternion = new THREE.Quaternion();
  const tipVector = new THREE.Vector3();

  /** A yaw about the jar's axis, then a tip about a horizontal axis. */
  function composePose(
    yaw: number,
    tip: number,
    tipAxis: number
  ): [number, number, number, number] {
    tipVector.set(Math.cos(tipAxis), 0, Math.sin(tipAxis));
    poseQuaternion.setFromAxisAngle(PLANE_UP, yaw);
    tipQuaternion.setFromAxisAngle(tipVector, tip);
    poseQuaternion.premultiply(tipQuaternion);
    return [poseQuaternion.x, poseQuaternion.y, poseQuaternion.z, poseQuaternion.w];
  }
  const bodyDirScratch: [number, number, number] = [0, 0, 0];
  const faceScratch: [number, number, number] = [0, 0, 0];
  const marimoGrab: [number, number, number] = [0, 0, 0];

  cameraTargetY = body.position[1] + 0.014;
  cameraDistance = CAMERA_BASE_DISTANCE + env.radiusM * CAMERA_DISTANCE_PER_RADIUS;
  placeCamera();

  let simAccumulator = 0;
  let careAccumulator = 0;
  let lastFrameTime = 0;
  /**
   * The FPS readout: frames counted over elapsed time, not a smoothed rate.
   *
   * Both obvious smoothing schemes are biased. Blending `1 / dt` reads high —
   * reciprocal is convex, so by Jensen's inequality the mean of the reciprocals
   * exceeds the reciprocal of the mean, and jitter inflates the answer; that is
   * what displayed 122 on a 120 Hz display. Blending `dt` with an
   * `exp(-dt / tau)` weight reads low instead, because a longer frame also earns
   * a larger weight, dragging the average toward the slow samples.
   *
   * Counting sidesteps both: frames over seconds is the definition of the
   * quantity, so there is no estimator left to be wrong.
   */
  let displayedFps = 60;
  let fpsFrames = 0;
  let fpsElapsed = 0;
  let simTime = 0;

  // ------------------------------------------------------------ interactions
  let grabbing = false;
  /** A stone is in hand. Mutually exclusive with `grabbing`: one pointer, one thing. */
  let grabbingStone = false;
  let orbiting = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let grabHoldSec = 0;
  let squeezeArmed = false;
  let squeezePulse = 0;
  let tumbleTimer = 0;
  let waterChangePhase: 'none' | 'drain' | 'refill' = 'none';
  let waterChangeTimer = 0;

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  /** The water plane a stone is aimed at, and where the aim lands on it. */
  const PLANE_UP = new THREE.Vector3(0, 1, 0);
  const dropPlane = new THREE.Plane();
  const dropPoint = new THREE.Vector3();
  const popForward = new THREE.Vector3();
  const grabTarget = new THREE.Vector3();
  const grabPlane = new THREE.Plane();
  const cameraForward = new THREE.Vector3();
  const ballPosition = new THREE.Vector3();
  /** Where a held stone is dragged: a camera-facing plane, fixed at the grab. */
  const stoneDragPlane = new THREE.Plane();
  const stonePlaneAnchor = new THREE.Vector3();
  const stoneTarget = new THREE.Vector3();
  const stoneGrabOffset = new THREE.Vector3();

  /**
   * The bubbles a press landed on, held until the pointer comes up. The water
   * is dragged by pressing on it, so this has to be a tap and not a press: any
   * real movement means the gesture was a stir or a grab all along, and the
   * candidates are dropped.
   */
  let popCandidates: BubbleHandle[] = [];

  /**
   * How far from a bubble a tap still counts, in CSS pixels.
   *
   * A fingertip, roughly, and far wider than the bubbles themselves: the very
   * biggest is about ten pixels across at this camera and most are three or
   * four, so anything tighter is a pixel-hunt rather than an interaction. In a
   * busy jar a reach this wide takes in several bubbles at once, and it breaks
   * all of them — which is why it can afford to be generous. There is no wrong
   * bubble to pick if nothing is being picked.
   */
  const POP_PICK_PAD_PX = 22;

  /** How far the pointer may travel and still count as a tap, in NDC. */
  const TAP_SLOP_NDC = 0.02;

  let viewportW = 1;
  let viewportH = 1;

  const pickPoint = new THREE.Vector3();

  /**
   * World point to CSS pixels, plus how many pixels a metre spans out there.
   *
   * The scale is the whole reason this is not a raycast: it turns each bubble's
   * real radius in metres into its real radius on screen, so the hit test knows
   * the difference between a bubble that looks big and one that is merely near.
   */
  const toScreen: ScreenProjector = (x, y, z, out) => {
    pickPoint.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    const depth = -pickPoint.z;
    if (!(depth > camera.near)) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      return;
    }
    // Divides through by w on the way, so this lands in NDC.
    pickPoint.applyMatrix4(camera.projectionMatrix);
    out[0] = (pickPoint.x * 0.5 + 0.5) * viewportW;
    out[1] = (0.5 - pickPoint.y * 0.5) * viewportH;
    out[2] = viewportH / (2 * depth * tanHalfFov);
  };

  /** The bubbles within reach of a pointer position in NDC. */
  function pickBubbles(nx: number, ny: number): BubbleHandle[] {
    if (viewportW <= 0 || viewportH <= 0) return [];
    // Pointer events land between frames, so the camera's matrices are a frame
    // stale — harmless for the ball, but a bubble is small enough to miss.
    camera.updateMatrixWorld();
    return particles.pickBubbles(
      toScreen,
      (nx * 0.5 + 0.5) * viewportW,
      (0.5 - ny * 0.5) * viewportH,
      POP_PICK_PAD_PX
    );
  }

  function ballWorldPosition(): THREE.Vector3 {
    return ballPosition.set(body.position[0], body.position[1], body.position[2]);
  }

  const viewPosition = new THREE.Vector3();
  const projected = new THREE.Vector3();

  /**
   * Where the marimo is on screen, once it has started to leave.
   *
   * The camera tracks the ball in Y but always looks at the jar's axis, so
   * sideways it does not follow at all — and on the portrait layout it sits
   * close enough to a small marimo that the glass is outside the frame. Nothing
   * about the simulation is wrong when that happens; the ball is exactly where
   * it should be. It is the framing that has lost it, so the framing is what
   * apologises.
   */
  function computeOffscreen(): OffscreenMarker | null {
    // The renderer has already refreshed these this frame, but doing it here
    // costs one matrix inverse and means the answer does not depend on being
    // called from the right place.
    camera.updateMatrixWorld();

    projected.copy(ballWorldPosition());
    viewPosition.copy(projected).applyMatrix4(camera.matrixWorldInverse);
    const depth = -viewPosition.z;
    projected.project(camera);

    if (depth <= 0) return offscreenMarker(projected.x, projected.y, 0, 0, true);

    // The coat stands off the body, and the coat is what you would still be
    // looking for, so it is the coat that decides when the ball is gone. Facets
    // move this by a few percent either way, which the fade band swallows.
    const silhouette = env.radiusM * (1 + FILAMENT_LENGTH_FRAC);
    const ndcRadiusY = silhouette / (depth * tanHalfFov);
    return offscreenMarker(projected.x, projected.y, ndcRadiusY / camera.aspect, ndcRadiusY);
  }

  /**
   * How far along the pointer ray the marimo is, or null if the ray misses it.
   *
   * This used to answer a plain yes or no, which was all a jar with one thing in
   * it needed. It has to be a distance now, because there can be a rock in front
   * of the ball and something has to decide which of them was pressed.
   *
   * Still analytic, and still generous: the coat stands proud of the body by a
   * third of a radius and is what your eye is aiming at.
   */
  function ballRayDistance(nx: number, ny: number): number | null {
    pointerNdc.set(nx, ny);
    raycaster.setFromCamera(pointerNdc, camera);
    const centre = ballWorldPosition();
    const reach = env.radiusM * 1.35;

    pickPoint.copy(centre).sub(raycaster.ray.origin);
    const along = pickPoint.dot(raycaster.ray.direction);
    const perpendicular = pickPoint.lengthSq() - along * along;
    if (perpendicular > reach * reach) return null;
    const distance = along - Math.sqrt(reach * reach - perpendicular);
    // Inside the ball already: the grab is at the pointer, not behind it.
    return distance < 0 ? 0 : distance;
  }

  /**
   * Set up the plane a stone will be dragged on, at the moment it is taken hold
   * of.
   *
   * The plane is fixed here and not moved again for the length of the drag. A
   * plane that followed the stone would let it drift toward or away from the
   * camera a little every frame, and a heavy thing on a spring chasing its own
   * reference frame walks off into the glass within a second or two.
   *
   * The offset is why a stone does not jump when you take hold of it: what the
   * spring is given is where the pointer is *plus* where the stone was relative
   * to the pointer when it was picked up, so it hangs off the point you grabbed
   * it by rather than snapping its middle under the cursor.
   */
  function anchorStoneDrag(nx: number, ny: number, id: number): void {
    const at = stones.positionOf(id);
    if (at) stonePlaneAnchor.copy(at);
    camera.getWorldDirection(cameraForward);
    stoneDragPlane.setFromNormalAndCoplanarPoint(cameraForward, stonePlaneAnchor);

    pointerNdc.set(nx, ny);
    raycaster.setFromCamera(pointerNdc, camera);
    if (raycaster.ray.intersectPlane(stoneDragPlane, stoneTarget)) {
      stoneGrabOffset.copy(stonePlaneAnchor).sub(stoneTarget);
    } else {
      stoneGrabOffset.set(0, 0, 0);
    }
  }

  /** Where the held stone is being asked to go, this frame. */
  function updateStoneTarget(nx: number, ny: number): [number, number, number] {
    pointerNdc.set(nx, ny);
    raycaster.setFromCamera(pointerNdc, camera);
    if (!raycaster.ray.intersectPlane(stoneDragPlane, stoneTarget)) {
      stoneTarget.copy(stonePlaneAnchor);
    }
    stoneTarget.add(stoneGrabOffset);

    // Never asked for somewhere outside the jar. The walls would stop it anyway,
    // but a spring pulling hard at a target behind the glass grinds the stone
    // along it instead of resting against it.
    stoneTarget.x = clamp(stoneTarget.x, -TANK_HALF_X, TANK_HALF_X);
    stoneTarget.z = clamp(stoneTarget.z, -TANK_HALF_Z, TANK_HALF_Z);
    stoneTarget.y = clamp(stoneTarget.y, FLOOR_Y, waterLevel + 0.01);
    return [stoneTarget.x, stoneTarget.y, stoneTarget.z];
  }

  function updateGrabTarget(nx: number, ny: number) {
    pointerNdc.set(nx, ny);
    raycaster.setFromCamera(pointerNdc, camera);
    camera.getWorldDirection(cameraForward);
    grabPlane.setFromNormalAndCoplanarPoint(cameraForward, ballWorldPosition());
    if (!raycaster.ray.intersectPlane(grabPlane, grabTarget)) {
      grabTarget.copy(ballWorldPosition());
    }
  }

  // --------------------------------------------------------------- care tick
  function tickCare(dt: number) {
    careAccumulator += dt;
    if (careAccumulator < CARE_TICK_SEC) return;
    careAccumulator = 0;

    const spin = spinMagnitude(body, OMEGA_REF);
    const before = state.gas;
    const result = catchUpToNow(state, Date.now(), { input: { spin } });

    // The care clock owns venting. The motion clock just reacts to it.
    if (result.ventCount > 0 || (before > VENT_THRESHOLD - 0.02 && state.gas < before - 0.2)) {
      body.venting = 1;
      // Gas forcing its way out through the coat takes some of what was
      // clinging to it with it, but not all — a vent is a leak, not a squeeze.
      particles.releaseBubbles(0.5);
      particles.burstBubbles(body.position[0], body.position[1], body.position[2], env.radiusM, 26);
    }

    saveMarimo(state);
  }

  /**
   * Track which side is resting on the gravel, in the body frame. Only while
   * grounded and slow, with a long time constant, so micro-jitter doesn't smear
   * the contact point around the ball.
   */
  function updateRestDir(dt: number) {
    if (!body.grounded) return;
    if (Math.hypot(body.velocity[0], body.velocity[1], body.velocity[2]) > 0.004) return;

    worldToBody(body.quaternion, 0, -1, 0, bodyDirScratch);
    const k = 1 - Math.exp(-dt / REST_DIR_TAU);
    let x = state.restDir[0] + (bodyDirScratch[0] - state.restDir[0]) * k;
    let y = state.restDir[1] + (bodyDirScratch[1] - state.restDir[1]) * k;
    let z = state.restDir[2] + (bodyDirScratch[2] - state.restDir[2]) * k;
    const len = Math.hypot(x, y, z) || 1;
    x /= len;
    y /= len;
    z /= len;
    state.restDir[0] = x;
    state.restDir[1] = y;
    state.restDir[2] = z;
  }

  function advanceWaterChange(dt: number) {
    if (waterChangePhase === 'none') return;
    waterChangeTimer += dt;

    if (waterChangePhase === 'drain') {
      const t = Math.min(1, waterChangeTimer / DRAIN_SEC);
      waterLevel = WATER_Y + (FLOOR_Y - WATER_Y) * t;
      if (t >= 1) {
        applyWaterChange(state, Date.now());
        particles.clearDebris();
        waterChangePhase = 'refill';
        waterChangeTimer = 0;
      }
    } else {
      const t = Math.min(1, waterChangeTimer / REFILL_SEC);
      waterLevel = FLOOR_Y + (WATER_Y - FLOOR_Y) * t;
      if (t >= 1) {
        waterLevel = WATER_Y;
        waterChangePhase = 'none';
        flushMarimo(state);
      }
    }
    tank.setWaterLevel(waterLevel);
  }

  function stepMotion(dt: number) {
    stepSwirl(swirl, dt);

    env.radiusM = state.radiusMm / 1000;
    env.gas = state.gas;
    shapeOf(state, shapeScratch);
    env.waterY = waterLevel;

    rippleStepsOwed++;
    stirPhase += swirl.omegaY * dt;
    stirChop += RIPPLE_STIR_CHOP * dt;

    if (tumbleTimer > 0) {
      tumbleTimer -= dt;
      body.omega[0] = TUMBLE_OMEGA * 0.7;
      body.omega[2] = TUMBLE_OMEGA;
    }

    // --- what the jar does not decide ---------------------------------------
    if (marimoHandle) {
      world.setMarimoShape(marimoHandle, env.radiusM, effectiveDensity(env.gas));

      // Held: dragged by a spring, and rolled between the palms. The roll is a
      // fact about hands rather than about water, so it is set outright rather
      // than asked for as a torque — see `setSpin`.
      if (grabbing) {
        marimoGrab[0] = grabTarget.x;
        marimoGrab[1] = grabTarget.y;
        marimoGrab[2] = grabTarget.z;
        marimoHandle.grabTarget = marimoGrab;
        world.wake(marimoHandle);

        camera.getWorldDirection(cameraForward);
        const [vx, vy, vz] = body.velocity;
        const R = Math.max(env.radiusM, 1e-4);
        world.setSpin(marimoHandle, [
          (cameraForward.y * vz - cameraForward.z * vy) / R,
          (cameraForward.z * vx - cameraForward.x * vz) / R,
          (cameraForward.x * vy - cameraForward.y * vx) / R
        ]);
      } else {
        marimoHandle.grabTarget = null;
      }

      if (tumbleTimer > 0) {
        tumbleTimer -= dt;
        world.setSpin(marimoHandle, [TUMBLE_OMEGA * 0.7, 0, TUMBLE_OMEGA]);
        world.wake(marimoHandle);
      }

      // The two rotational frictions the engine does not model, both from the
      // old hand-rolled contact model and both real.
      //
      // Jolt's buoyancy helper damps the spin of a smooth wet body, and a
      // marimo is not one: it is velvet, and `spinDragRate` is the laminar
      // sphere result multiplied by what the coat measures against it. And at
      // a point contact Jolt has no rolling or twisting friction at all — an
      // ideal sphere on an ideal plane rolls forever, which is correct and
      // useless, because the gravel is not a plane: the ball sits in a dimple
      // of its own making, and `contactGrip` is what it costs to climb out.
      //
      // Without these, one sideways drag left the pet spinning for as long as
      // anyone cared to watch.
      if (!world.asleep(marimoHandle)) {
        const rhoEff = effectiveDensity(env.gas);

        // Against the water's own rotation, not against stillness: a stirred
        // jar is supposed to carry the ball around with it.
        const waterSpin = waterSpinAt(swirl, body.position[0], body.position[2]);
        const slipX = body.omega[0];
        const slipY = body.omega[1] - waterSpin;
        const slipZ = body.omega[2];
        const slip = Math.hypot(slipX, slipY, slipZ);
        if (slip > 1e-4) {
          const rate = spinDragRate(rhoEff, env.radiusM, slip);
          world.addTorque(marimoHandle, -slipX * rate, -slipY * rate, -slipZ * rate);
        }

        if (body.grounded) {
          const spin = Math.hypot(body.omega[0], body.omega[1], body.omega[2]);
          if (spin > 1e-4) {
            // `SPIN_FRICTION_COEF` is 1/(2/5): the sphere's inertia factor, so
            // this is the linear bite `FLOOR_MU_ROLL · grip` expressed about
            // the axle instead of along the floor.
            const decel = (SPIN_FRICTION_COEF * FLOOR_MU_ROLL * contactGrip(rhoEff)) / env.radiusM;
            const rate = Math.min(decel / spin, ROLL_RATE_CAP);
            world.addTorque(
              marimoHandle,
              -body.omega[0] * rate,
              -body.omega[1] * rate,
              -body.omega[2] * rate
            );
          }
        }
      }

      // A flat side is a stable place to lie, so a ball that has one finds it.
      // Jolt cannot know about this: the marimo collides as a sphere, because
      // rebuilding its hull every frame for a shape that changes over weeks
      // would be absurd. So the one thing the sphere cannot express — that it
      // would rather be face down — is applied as a torque: a spring toward the
      // face and a damper against the rocking, critically matched so the ball
      // noses down once and stays rather than swinging.
      //
      // Not while asleep. A settled marimo is lying on the very face this pulls
      // toward, so the torque is near zero there anyway — but "near" fed to a
      // sleeping body 240 times a second is an account that never gets settled.
      if (body.grounded && !world.asleep(marimoHandle)) {
        const facet = deepestFacet(shapeScratch);
        if (facet && facet.depth > FACET_MIN_DEPTH) {
          bodyToWorld(body.quaternion, facet.d[0], facet.d[1], facet.d[2], faceScratch);
          const lean = clamp(facet.depth / FACET_MAX_DEPTH, 0, 1) * FACET_SETTLE_ACCEL;
          world.addTorque(
            marimoHandle,
            faceScratch[2] * lean - body.omega[0] * FACET_SETTLE_DAMPING,
            0,
            -faceScratch[0] * lean - body.omega[2] * FACET_SETTLE_DAMPING
          );
        }
      }
    }

    // --- one step, everything at once ---------------------------------------
    world.step(dt, waterLevel, sampleFlow);

    if (marimoHandle) {
      world.readPose(marimoHandle, body.position, body.quaternion);
      world.readVelocity(marimoHandle, body.velocity, body.omega);
      body.grounded = world.isSupported(marimoHandle);
    }

    stones.stepPop(dt);
    stones.sync(waterLevel, stoneSplashes);
    collectSplashes();

    if (body.venting > 0) body.venting = Math.max(0, body.venting - dt / 3);
    if (squeezePulse > 0) squeezePulse = Math.max(0, squeezePulse - dt * 2.2);

    updateRestDir(dt);
  }

  function sampleFlow(x: number, y: number, z: number, out: [number, number, number]) {
    waterVelocityAt(swirl, x, y, z, out);
  }

  /**
   * Keep the marimo framed. The camera lags behind it vertically so a rise to
   * the surface reads as movement rather than the whole scene sliding, and it
   * pulls back as the ball grows so a well-kept marimo doesn't outgrow the shot.
   */
  function trackCamera(dt: number) {
    // Biased upward so the water surface stays in shot above the marimo.
    const desiredY = clamp(body.position[1] + 0.014, FLOOR_Y + 0.02, WATER_Y - 0.014);
    const k = 1 - Math.exp(-dt / CAMERA_FOLLOW_TAU);
    cameraTargetY += (desiredY - cameraTargetY) * k;
    cameraDistance = CAMERA_BASE_DISTANCE + env.radiusM * CAMERA_DISTANCE_PER_RADIUS;
    placeCamera();
  }

  // ---------------------------------------------------------- refraction pass
  /**
   * One half-resolution target: the tank seen from a camera mirrored through
   * the water plane. That is what total internal reflection shows on the
   * underside of the surface, which past the critical angle is most of it.
   *
   * Half resolution is deliberate — a reflection off a rippled surface is
   * low-frequency, and the softness hides the seams rather than sharpening them.
   */
  const useTargets = variant === 'full';
  let reflectionTarget: THREE.WebGLRenderTarget | null = null;

  /**
   * The wave field.
   *
   * Half-float render targets are the one thing here that a context can refuse.
   * If it does, the sim is simply absent and the surface shader reads a null
   * texture as flat — a glassy jar rather than a broken one.
   */
  let rippleSim: RippleSim | null = null;
  try {
    rippleSim = createRippleSim(renderer, DEFAULT_RIPPLE_SIM);
    // A new target's contents are specified to be zero, but the water starting
    // flat is not a thing to leave to a specification — a jar that opens with a
    // frame of noise in it would ring for seconds before anyone touched it.
    rippleSim.reset(renderer);
  } catch {
    rippleSim = null;
  }

  /**
   * What is pushing on the water.
   *
   * Nothing keeps this going in the background. Left alone the jar damps to
   * glass and stays there, which is what a jar does. Everything on this list is
   * an event: gas arriving at the top and bursting, the marimo coming up far
   * enough to matter, and the water being stirred on purpose.
   */
  const rippleDrops: RippleDrop[] = [];
  /** Flat (x, z, radius) triples, drained from the bubbles each frame. */
  const surfacings: number[] = [];
  let rippleStepsOwed = 0;
  let stirPhase = 0;
  let stirChop = 0;

  /** Depth over which a rising marimo starts to show on the surface, metres. */
  const RIPPLE_BALL_REACH = 0.025;
  /**
   * Millimetres of push per step per metre-per-second of the ball's rise.
   * Two seconds of bobbing at 20 mm/s comes to about a third of a millimetre.
   */
  const RIPPLE_BALL_PUSH = 0.5;
  /** Millimetres of push per step from a fully stirred jar. Peaks near 0.8 mm. */
  const RIPPLE_STIR_PUSH = 0.015;
  /** How fast a stir slops the water back and forth, rad/s. */
  const RIPPLE_STIR_CHOP = 31;

  /** Bursts still in progress: x, z, radius, steps left. */
  const bursts: { x: number; z: number; radius: number; left: number }[] = [];

  /**
   * A stone going through the surface, as a push on the water.
   *
   * The shape of it is a burst's: up while the water is being shouldered aside,
   * down as the cavity closes, which is what leaves a ring travelling out rather
   * than a permanent dimple. What differs is the size — a stone is ten times a
   * bubble across — and that the strength answers to how fast it was going,
   * because a stone lowered in gently should not make the same wave as one
   * dropped from the sticker sheet.
   *
   * The coefficient is where the honesty stops: a real 20 mm stone hitting water
   * at half a metre a second throws a wave that would leave this jar. What is
   * wanted is the biggest thing that ever happens to this water, comfortably
   * inside what the grid can carry — about twice a hard stir.
   */
  const STONE_SPLASH_PUSH = 0.9;
  /** Splashes waiting to be spent, as `bursts` entries with their own strength. */
  const splashes: { x: number; z: number; radius: number; strength: number; left: number }[] = [];
  const stoneSplashes: StoneSplash[] = [];

  /**
   * Back to glass, with nothing queued against it.
   *
   * Both edges of the reduced-motion switch need this. Going in, so a ring
   * already crossing the jar is not frozen there for as long as the setting
   * lasts; coming out, so the water starts from flat rather than resuming a
   * wave that was launched minutes ago.
   */
  function stillWater() {
    bursts.length = 0;
    splashes.length = 0;
    rippleStepsOwed = 0;
    rippleSim?.reset(renderer);
  }

  function collectRippleDrops(): RippleDrop[] {
    rippleDrops.length = 0;

    // A bubble reaching the top. The cavity it leaves collapses and rings, which
    // is the one thing that disturbs an otherwise untouched jar — and the reason
    // a marimo that is photosynthesising has a surface that moves at all.
    particles.takeBubbleSurfacings(surfacings);
    for (let i = 0; i + 2 < surfacings.length; i += 3) {
      bursts.push({
        x: surfacings[i],
        z: surfacings[i + 1],
        // Its own radius, whatever it is. What the grid can draw is `burstDrop`'s
        // problem, and it is not this one: a bubble too small to be resolved is
        // still a bubble too small to be heard.
        radius: surfacings[i + 2],
        left: RIPPLE_BURST_STEPS
      });
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const burst = bursts[i];
      // Up on the first half, down on the second: the film lifts and the cavity
      // falls back in, which is what leaves a ring behind rather than a dimple.
      rippleDrops.push(burstDrop(burst.x, burst.z, burst.radius, burst.left));
      if (--burst.left <= 0) bursts.splice(i, 1);
    }

    // A stone arriving. Same two-halved kernel as a burst, so it is a ring and
    // not a dent, but its own size and its own strength.
    for (let i = splashes.length - 1; i >= 0; i--) {
      const splash = splashes[i];
      const lifting = splash.left > RIPPLE_BURST_STEPS / 2;
      rippleDrops.push({
        x: splash.x,
        z: splash.z,
        radius: splash.radius,
        strength: (lifting ? 1 : -1) * splash.strength
      });
      if (--splash.left <= 0) splashes.splice(i, 1);
    }

    // The marimo, pressing up into the surface from below. It only counts as it
    // gets close: a ball on the gravel is 60 mm down and the water above it does
    // not know it is there.
    const radiusM = state.radiusMm / 1000;
    const gap = waterLevel - (body.position[1] + radiusM);
    const reach = 1 - Math.min(1, Math.max(0, gap) / RIPPLE_BALL_REACH);
    if (reach > 0) {
      rippleDrops.push({
        x: body.position[0],
        z: body.position[2],
        radius: Math.max(radiusM, 0.006),
        // Rising presses the surface up, sinking pulls it down. A ball hanging
        // motionless makes no waves, which is right — it is displacement that
        // radiates, not presence, and it is also what keeps this source from
        // holding one sign for long enough to dig a hole.
        strength: body.velocity[1] * RIPPLE_BALL_PUSH * reach
      });
    }

    // Stirring. The swirl is a rotation of the whole body of water, and what
    // that does to the surface is slop it from side to side while dragging the
    // slop round the jar. One source going round at the water's own rate, beating
    // as it goes, says that.
    const spin = Math.min(1, Math.abs(swirl.omegaY) / SWIRL_MAX_OMEGA);
    if (spin > 0.01) {
      const orbit = Math.min(TANK_HALF_X, TANK_HALF_Z) * 0.55;
      rippleDrops.push({
        x: Math.cos(stirPhase) * orbit,
        z: Math.sin(stirPhase) * orbit,
        radius: 0.013,
        strength: Math.sin(stirChop) * RIPPLE_STIR_PUSH * spin
      });
    }

    return rippleDrops;
  }
  const reflectionCamera = new THREE.PerspectiveCamera(35, 1, 0.005, 3);

  function makeTarget(w: number, h: number) {
    const target = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true
    });
    target.texture.colorSpace = THREE.SRGBColorSpace;
    return target;
  }

  function setVisible(objects: THREE.Object3D[], visible: boolean) {
    for (const object of objects) object.visible = visible;
  }

  const reflectionViewProjection = new THREE.Matrix4();
  const reflectionTarget3 = new THREE.Vector3();

  /**
   * Mirror the camera through the horizontal water plane.
   *
   * The surface reads this camera's own view-projection to place what its
   * reflected rays are looking at, so the matrix is handed over here rather than
   * recovered from screen coordinates later. That is also what lets the meniscus
   * be reflected at all: a fillet fragment is not on the mirror plane, so its
   * screen position says nothing useful about where its reflection went.
   */
  function placeReflectionCamera() {
    reflectionTarget3.set(0, cameraTargetY + pitchOffset, 0);
    tank.setReflectionMatrix(
      mirrorCameraMatrix(
        reflectionViewProjection,
        reflectionCamera,
        camera,
        reflectionTarget3,
        waterLevel
      )
    );
  }

  function renderTargets() {
    if (!reflectionTarget) return;

    setVisible(tank.hideForReflection, false);
    placeReflectionCamera();
    renderer.setRenderTarget(reflectionTarget);
    renderer.clear();
    renderer.render(scene, reflectionCamera);
    setVisible(tank.hideForReflection, true);

    renderer.setRenderTarget(null);
  }

  // ------------------------------------------------------------------ render
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w <= 0 || h <= 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    // CSS pixels, not device pixels: this is what pointer events are measured
    // in, and bubble picking is the only thing that reads it.
    viewportW = w;
    viewportH = h;

    const pixelRatio = renderer.getPixelRatio();
    const pixelWidth = Math.max(1, Math.round(w * pixelRatio));
    const pixelHeight = Math.max(1, Math.round(h * pixelRatio));

    marimo.setViewportHeight(pixelHeight);
    particles.setPixelScale(pixelHeight * 0.5);

    if (useTargets) {
      const tw = Math.max(1, Math.round(pixelWidth / 2));
      const th = Math.max(1, Math.round(pixelHeight / 2));
      if (!reflectionTarget) {
        reflectionTarget = makeTarget(tw, th);
        tank.setReflectionTexture(reflectionTarget.texture);
      } else {
        reflectionTarget.setSize(tw, th);
      }
    }
  }

  const flowTarget = new THREE.Vector3();
  const flowLagged = new THREE.Vector3();
  const flowLagVel = new THREE.Vector3();
  const flowAccel = new THREE.Vector3();
  const flowLocal = new THREE.Vector3();
  const bodyQuaternion = new THREE.Quaternion();
  const inverseQuaternion = new THREE.Quaternion();

  /**
   * Let the coat catch up to the water, underdamped.
   *
   * Sprung in world space rather than in the marimo's frame: the ball rotates,
   * and a spring living in a rotating frame would smear the lag around the ball
   * as it turned instead of leaving it pointing the way the water is going.
   */
  function stepFlowLag(dt: number) {
    const k = FILAMENT_FLOW_OMEGA * FILAMENT_FLOW_OMEGA;
    const c = 2 * FILAMENT_FLOW_DAMPING * FILAMENT_FLOW_OMEGA;
    let remaining = Math.min(dt, 0.25);
    while (remaining > 0) {
      const h = Math.min(remaining, FILAMENT_FLOW_STEP_SEC);
      remaining -= h;
      flowAccel.copy(flowTarget).sub(flowLagged).multiplyScalar(k);
      flowAccel.addScaledVector(flowLagVel, -c);
      flowLagVel.addScaledVector(flowAccel, h);
      flowLagged.addScaledVector(flowLagVel, h);
    }
  }

  function pushVisuals(dt: number) {
    const radiusM = state.radiusMm / 1000;

    marimo.setShape(shapeScratch, radiusM * (1 + squeezePulse * 0.05));
    marimo.setVigor(state.vigor);
    marimo.group.position.set(body.position[0], body.position[1], body.position[2]);
    bodyQuaternion.set(
      body.quaternion[0],
      body.quaternion[1],
      body.quaternion[2],
      body.quaternion[3]
    );
    marimo.group.quaternion.copy(bodyQuaternion);

    // Filaments lie over in the flow. Relative velocity, lagged, then rotated
    // into the marimo's own frame, because the shape field lives there too.
    flowTarget.set(
      env.waterVel[0] - body.velocity[0],
      env.waterVel[1] - body.velocity[1],
      env.waterVel[2] - body.velocity[2]
    );
    flowTarget.multiplyScalar(reducedMotion ? 4 : 9);
    stepFlowLag(dt);
    flowLocal.copy(flowLagged).applyQuaternion(inverseQuaternion.copy(bodyQuaternion).invert());
    marimo.setFlow(flowLocal.x, flowLocal.y, flowLocal.z);
    marimo.setTime(simTime);

    const coefficients = waterCoefficients(state.fouling);
    water.uSigmaA.value.fromArray(coefficients.sigmaA);
    water.uSigmaS.value.fromArray(coefficients.sigmaS);
    // The volume's ceiling is the current surface, so a marimo poking out of the
    // water is correctly unattenuated above the line, and a drained jar stops
    // tinting anything at all.
    water.uWaterBoxMax.value.y = waterLevel;

    tank.setRippleTexture(reducedMotion ? null : (rippleSim?.texture ?? null));

    particles.setBall(
      body.position[0],
      body.position[1],
      body.position[2],
      radiusM,
      body.quaternion[0],
      body.quaternion[1],
      body.quaternion[2],
      body.quaternion[3]
    );

    // A healthy marimo fizzes gently all the time.
    if (waterChangePhase === 'none') {
      particles.trickleBubbles(
        body.position[0],
        body.position[1],
        body.position[2],
        radiusM,
        dt,
        0.8 * state.vigor
      );
    }

    // Drag the ball and you shed what it was holding. Measured against the
    // water rather than the jar, so stirring a current past a still marimo
    // strips it exactly as dragging a marimo through still water does, and a
    // ball riding a current it matches keeps hold of everything. Rolling it
    // over sheds bubbles too, but that needs no help from here: the seats
    // themselves turn underneath and let go.
    const slip = Math.hypot(
      env.waterVel[0] - body.velocity[0],
      env.waterVel[1] - body.velocity[1],
      env.waterVel[2] - body.velocity[2]
    );
    particles.shearBubbles(slip, dt);
    particles.update(dt, waterChangePhase === 'none' ? state.fouling : 0, sampleFlow);
  }

  function render(timeMs: number): MarimoSnapshot {
    let dt = 0;
    if (lastFrameTime > 0) {
      dt = (timeMs - lastFrameTime) / 1000;
      // A gap this long is a discontinuity — a hidden tab resuming — not a slow
      // frame, and folding it in would peg the readout near zero for a moment on
      // every return. Genuinely bad frame rates are far short of it, so they
      // still register rather than being clamped out of sight.
      if (dt > 0 && dt < FPS_DISCONTINUITY_SEC) {
        fpsFrames++;
        fpsElapsed += dt;
        if (fpsElapsed >= FPS_WINDOW_SEC) {
          displayedFps = fpsFrames / fpsElapsed;
          fpsFrames = 0;
          fpsElapsed = 0;
        }
      }
    }
    lastFrameTime = timeMs;

    const dtClamped = Math.min(dt, 0.05);
    simAccumulator += dtClamped;
    let substeps = 0;
    while (simAccumulator >= SIM_STEP_SEC && substeps < MAX_SIM_SUBSTEPS) {
      simTime += SIM_STEP_SEC;
      stepMotion(SIM_STEP_SEC);
      simAccumulator -= SIM_STEP_SEC;
      substeps++;
    }

    advanceWaterChange(dtClamped);
    trackStoneRest();
    tickCare(dtClamped);
    trackCamera(dtClamped);

    if (grabbing) {
      grabHoldSec += dtClamped;
      if (squeezeArmed && grabHoldSec > 0.4) {
        squeezeArmed = false;
        // A press held long enough to be a squeeze has stopped being a tap, so
        // whatever bubbles it started on are no longer being aimed at — and the
        // squeeze has just shaken them off the coat anyway.
        popCandidates = [];
        doSqueeze();
      }
    }

    if (reducedMotion) {
      // The bubbles go on reporting their arrivals whether or not the water is
      // listening, and that list is only ever emptied by being read. Drain it
      // and drop it, rather than letting a session's worth of bursts pile up
      // behind a switch.
      particles.takeBubbleSurfacings(surfacings);
      surfacings.length = 0;
      rippleStepsOwed = 0;
    } else {
      rippleSim?.step(renderer, rippleStepsOwed, collectRippleDrops());
      rippleStepsOwed = 0;
    }

    pushVisuals(dtClamped);
    if (useTargets) renderTargets();
    renderer.render(scene, camera);

    return {
      state,
      displayFps: displayedFps,
      grabbing,
      waterChanging: waterChangePhase !== 'none',
      canChangeWater: waterChangePhase === 'none' && state.fouling >= WATER_CHANGE_MIN_FOULING,
      offscreen: computeOffscreen()
    };
  }

  /** Turn anything that broke the surface this step into a splash. */
  function collectSplashes() {
    for (const splash of stoneSplashes) {
      // Bubbles first: air is dragged down with anything that breaks a surface,
      // and it comes back up. This is also the part that reads at a glance.
      particles.burstBubbles(splash.x, waterLevel - splash.radius, splash.z, splash.radius, 18);

      if (reducedMotion) continue;
      splashes.push({
        x: splash.x,
        z: splash.z,
        radius: splash.radius * 1.6,
        // Speed-scaled against the terminal velocity a stone of this size
        // actually reaches, so the number stays in range rather than being
        // whatever the solver happened to hand over on one particular step.
        strength: splash.radius * 1000 * STONE_SPLASH_PUSH * clamp(splash.speed / 0.35, 0.25, 1),
        left: RIPPLE_BURST_STEPS
      });
    }
  }

  /**
   * Write the stones down once they have all stopped moving.
   *
   * The edge from "something is moving" to "everything has settled" is the only
   * moment a stone's resting place is final. Before it, what is stored would be
   * where the stone was aimed rather than where it fetched up — and now that
   * they can be shoved about by each other and by the marimo, "where it fetched
   * up" can be several seconds and three collisions after the drop.
   */
  function trackStoneRest() {
    const busy = stones.busy();
    if (stonesBusy && !busy) notifyStones();
    stonesBusy = busy;
  }

  function notifyStones() {
    options.onStonesChanged?.(stones.contents());
  }

  function doSqueeze() {
    applySqueeze(state);
    squeezePulse = 1;
    // Everything the coat was holding onto goes at once — that is most of what
    // a squeeze looks like — and the pressed-out gas comes up behind it.
    particles.releaseBubbles(1);
    particles.burstBubbles(body.position[0], body.position[1], body.position[2], env.radiusM, 22);
    saveMarimo(state);
  }

  // ------------------------------------------------------------------- public
  return {
    renderer,
    resize,
    render,

    pointerDown(nx, ny, orbit) {
      lastPointerX = nx;
      lastPointerY = ny;
      if (orbit) {
        orbiting = true;
        return;
      }

      // Only candidates. Nothing else about the press changes, because bubbles
      // in front of the marimo must not eat the grab that was meant for the
      // ball behind them — both are set up, and letting go without having moved
      // is what decides it was the bubbles.
      popCandidates = pickBubbles(nx, ny);

      // Whichever is in front. The marimo is tested as a sphere and every stone
      // as its own little cluster of them, so this is one comparison of two
      // ray distances rather than a priority rule — press on the rock that is
      // sitting in front of the ball and you get the rock, which is the only
      // answer that does not require knowing what the tank was thinking.
      const ballDistance = ballRayDistance(nx, ny);
      pointerNdc.set(nx, ny);
      raycaster.setFromCamera(pointerNdc, camera);
      const stoneHit = stoneCount > 0 ? stones.pick(raycaster) : null;

      if (stoneHit && (ballDistance === null || stoneHit.distance < ballDistance)) {
        grabbingStone = true;
        // The stone is dragged on the plane through where it is now, facing the
        // camera — the same plane the marimo is dragged on, and for the same
        // reason: it is the one surface on which the pointer's motion is the
        // stone's motion, with no depth guessing anywhere.
        anchorStoneDrag(nx, ny, stoneHit.id);
        stones.grab(stoneHit.id, ...updateStoneTarget(nx, ny));
        // A press on a rock is not a press on the water, and the bubbles in
        // front of it were not what was being aimed at either.
        popCandidates = [];
        return;
      }

      if (ballDistance !== null) {
        grabbing = true;
        grabHoldSec = 0;
        squeezeArmed = true;
        updateGrabTarget(nx, ny);
      }
    },

    pointerMove(nx, ny) {
      const dx = nx - lastPointerX;
      const dy = ny - lastPointerY;
      lastPointerX = nx;
      lastPointerY = ny;

      if (popCandidates.length > 0 && Math.hypot(dx, dy) > TAP_SLOP_NDC) popCandidates = [];

      if (orbiting) {
        azimuth = clamp(azimuth - dx * 1.6, -0.62, 0.62);
        pitchOffset = clamp(pitchOffset - dy * 0.06, PITCH_MIN, PITCH_MAX);
        placeCamera();
        return;
      }

      if (grabbingStone) {
        stones.dragTo(...updateStoneTarget(nx, ny));
        return;
      }

      if (grabbing) {
        // Any real movement means this is a drag, not a squeeze.
        if (Math.hypot(dx, dy) > TAP_SLOP_NDC) squeezeArmed = false;
        updateGrabTarget(nx, ny);
        return;
      }

      // Otherwise you are stirring the water.
      //
      // The vertical gain is small on purpose. Sideways you are winding up a
      // vortex that can genuinely coast, so a long drag should keep adding to
      // it; vertically you are only leaning on an overturning cell that the jar
      // immediately fights back against. At the old gain a single upward flick
      // saturated the cell, and since a marimo sits near neutral buoyancy it
      // just rode the water to the surface — dragging the water read as
      // dragging the ball.
      stirSwirl(swirl, -dx * 14 * motionScale, dy * STIR_VERTICAL_GAIN * motionScale);
    },

    pointerUp() {
      // The bubbles that were pressed, wherever they have climbed to since —
      // not whatever is under the pointer now, which after even a brief press
      // is several millimetres of water. Stale handles ignore themselves, as do
      // the ones too small to break, so this is every bubble that can go.
      for (const handle of popCandidates) particles.popBubble(handle);
      popCandidates = [];

      if (grabbingStone) {
        stones.release();
        grabbingStone = false;
        // Let go in mid-water and it drops. Nothing has to be told to make that
        // happen: the spring that was holding it up is simply gone.
        stonesBusy = true;
      }

      grabbing = false;
      orbiting = false;
      squeezeArmed = false;
      grabHoldSec = 0;
    },

    waterChange() {
      if (waterChangePhase !== 'none') return;
      // Nothing stays stuck to a ball you are about to pour the water out from
      // under, and the trickle stops for the duration, so the coat comes back
      // bare and starts filling again on fresh water.
      particles.releaseBubbles(1);
      waterChangePhase = 'drain';
      waterChangeTimer = 0;
    },

    tumble() {
      tumbleTimer = 3;
    },

    stir() {
      stirSwirl(swirl, SWIRL_MAX_OMEGA * 0.8 * motionScale, 0.04 * motionScale);
    },

    squeeze() {
      doSqueeze();
    },

    grabAt(nx, ny) {
      lastPointerX = nx;
      lastPointerY = ny;

      // No bubble candidates: the press landed on a marker, not on the water,
      // so there is nothing under it to pop.
      popCandidates = [];

      grabbing = true;
      grabHoldSec = 0;
      // Not armed. Holding still is the whole gesture here — you press and wait
      // for the marimo to arrive — and that must not come out as a squeeze.
      squeezeArmed = false;
      updateGrabTarget(nx, ny);
    },

    flush() {
      catchUpToNow(state, Date.now(), { input: { spin: spinMagnitude(body, OMEGA_REF) } });
      flushMarimo(state);
    },

    setReducedMotion(reduced) {
      if (reduced === reducedMotion) return;
      reducedMotion = reduced;
      applyMotionPreference();
      stones.setReducedMotion(reduced);
      stillWater();
    },

    setLighting(next) {
      lighting = next;
      applyCurrentLighting();
    },

    dropStone(stone, nx, ny, stickerRadiusPx) {
      if (stones.contents().length >= STONE_MAX_IN_TANK) return null;

      const extents = measureStone(stone);
      // Everything about the drop — where it lands, which way up it lies, which
      // way it tumbles on the way down — comes off the stone's own seed, so a
      // stone dropped in the same place twice behaves the same way twice.
      const rand = mulberry32((stone.seed ^ 0x2545f491) >>> 0);

      // Where the pointer was pointing, taken on the gravel.
      //
      // The floor rather than the surface, which is the tempting one — a stone
      // is let go over the water, after all. But a stone *lands* on the floor,
      // and the floor is what fills the lower half of the frame, so aiming at
      // it is the only mapping under which a stone dropped onto a visible patch
      // of gravel lands on that patch. Aiming at the surface instead sends
      // everything to the back wall: the camera looks very slightly up, so a
      // ray toward anywhere but the very bottom of the frame meets the water
      // plane metres away and clamps.
      //
      // A ray that is going upward meets no floor at all, and that is where the
      // surface comes back in as the fallback: it will be far off and it will
      // clamp, which is exactly right for a stone lobbed at the top of the jar.
      // Null coordinates are a press with no pointer behind it, which is not an
      // aim of zero — it is no aim, and the placement search picks the spot.
      let aimed: { x: number; z: number } | undefined;
      if (nx !== null && ny !== null) {
        pointerNdc.set(nx, ny);
        raycaster.setFromCamera(pointerNdc, camera);
        dropPlane.set(PLANE_UP, -FLOOR_Y);
        let hit = raycaster.ray.intersectPlane(dropPlane, dropPoint);
        if (!hit) {
          dropPlane.set(PLANE_UP, -waterLevel);
          hit = raycaster.ray.intersectPlane(dropPlane, dropPoint);
        }
        if (hit) aimed = { x: dropPoint.x, z: dropPoint.z };
      }

      const spot = findPlacement(extents, stones.occupants(), rand, aimed);
      const y = reducedMotion ? restingY(extents) : spawnHeight(waterLevel);

      // Tipped as well as turned. A stone let go at the surface arrives at
      // whatever angle it happens to be at and finds its own way down onto a
      // face — which is the whole reason it is worth them being bodies. The
      // tip is kept modest so the pop still ends somewhere near flat and the
      // sticker's picture is still recognisable at the end of it.
      const yaw = rand() * Math.PI * 2;
      const tip = (rand() * 2 - 1) * 0.5;
      const tipAxis = rand() * Math.PI * 2;
      const placed: PlacedStone = {
        id: nextStoneId++,
        stone,
        position: [spot.x, y, spot.z],
        quaternion: composePose(yaw, tip, tipAxis)
      };

      let arrival: { origin: PopOrigin; y: number } | null = null;
      if (stickerRadiusPx !== null && !reducedMotion && viewportH > 0) {
        // The pop starts at the size the sticker was. Working that out needs the
        // scale at the *stone's* depth rather than at the pointer's, which are
        // not the same thing on a perspective camera — the sticker was on the
        // glass, and the stone is somewhere behind it.
        camera.updateMatrixWorld();
        dropPoint.set(spot.x, y, spot.z).applyMatrix4(camera.matrixWorldInverse);
        const depth = Math.max(-dropPoint.z, camera.near);
        const pxPerMetre = viewportH / (2 * depth * tanHalfFov);
        const stoneRadiusPx = Math.max(extents[0], extents[2]) * pxPerMetre;
        camera.getWorldDirection(popForward);
        arrival = {
          y,
          origin: {
            // Bounded, so a sticker sheet scaled up on a very large display
            // cannot start the pop with a boulder filling the frame.
            screenScale: clamp(stickerRadiusPx / Math.max(stoneRadiusPx, 1), 0.4, 8),
            forward: popForward
          }
        };
      }

      stones.add(placed, arrival);
      stoneCount = stones.contents().length;
      stonesBusy = true;
      notifyStones();
      return placed;
    },

    removeStone(id) {
      const removed = stones.remove(id);
      if (!removed) return false;
      stoneCount = stones.contents().length;
      // Whatever was leaning on it has lost its prop and should fall.
      stonesBusy = true;
      notifyStones();
      return true;
    },

    stones() {
      return stones.contents();
    },

    clearStones() {
      stones.clear();
      stoneCount = 0;
      notifyStones();
    },

    timeTravel(ms) {
      const result = catchUpToNow(state, Date.now() + ms, { input: { spin: 0 } });
      // Re-anchor to now so the offset is a one-off jump, not a permanent skew.
      state.lastTickAt = Date.now();
      flushMarimo(state);
      return result;
    },

    takeArrivalResult() {
      const result = arrivalResult;
      arrivalResult = null;
      return result;
    },

    dispose() {
      flushMarimo(state);
      reflectionTarget?.dispose();
      rippleSim?.dispose();
      surroundings.dispose();
      tank.dispose();
      marimo.dispose();
      stones.dispose();
      world.dispose();
      particles.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    }
  };
}
