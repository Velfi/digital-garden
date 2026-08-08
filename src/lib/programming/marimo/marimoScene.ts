import * as THREE from 'three';
import {
  FILAMENT_COUNT_AMBIENT,
  FILAMENT_COUNT_FULL,
  FILAMENT_FLOW_DAMPING,
  FILAMENT_FLOW_OMEGA,
  FILAMENT_FLOW_STEP_SEC,
  FILAMENT_LENGTH_FRAC,
  FLOOR_Y,
  MAX_FACETS,
  OMEGA_REF,
  SWIRL_MAX_OMEGA,
  TANK_HALF_X,
  TANK_HALF_Z,
  VENT_THRESHOLD,
  WATER_CHANGE_MIN_FOULING,
  WATER_Y
} from './constants';
import { applySqueeze, applyWaterChange, clamp, shapeOf } from './careSim';
import { newShape } from './facets';
import { SH_COUNT } from './sphericalHarmonics';
import { catchUpToNow } from './catchUp';
import {
  neutralGas,
  newBody,
  spinMagnitude,
  stepBody,
  worldToBody,
  type BodyEnv
} from './buoyancy';
import { createMarimoMesh, type MarimoMeshBundle } from './marimoMesh';
import { offscreenMarker, type OffscreenMarker } from './offscreen';
import { createParticles, type ParticleBundle } from './particles';
import type { BubbleHandle, ScreenProjector } from './bubbleMesh';
import { flushMarimo, loadMarimo, saveMarimo } from './persist';
import { createRoom, type RoomBundle } from './roomMesh';
import { newSwirl, stepSwirl, stirSwirl, waterSpinAt, waterVelocityAt } from './swirl';
import { createTank, mirrorCameraMatrix, type TankBundle } from './tankMesh';
import { DEFAULT_RIPPLE_SIM, createRippleSim, type RippleDrop, type RippleSim } from './rippleSim';
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
/**
 * Grab spring, roughly critically damped at about 3 Hz.
 *
 * These were an order of magnitude softer to begin with, which put the spring's
 * pull in the same range as buoyancy — the ball drifted vaguely toward the
 * pointer instead of following it, so handling it barely turned it and the
 * re-rounding mechanic never fired.
 */
const GRAB_STIFFNESS = 420;
const GRAB_DAMPING = 42;
const REST_DIR_TAU = 30;
const TUMBLE_OMEGA = 3.2;

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
  options: MarimoSceneOptions = {}
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
  /** Everything reduced motion touches, in one place so it can be changed live. */
  function applyMotionPreference() {
    motionScale = reducedMotion ? 0.35 : 1;
    marimo.setSwayScale(motionScale);
  }
  applyMotionPreference();
  const particles: ParticleBundle = createParticles(water, room, light, marimo.colour);

  scene.add(surroundings.group);
  scene.add(tank.group);
  scene.add(marimo.group);
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
  const waterVelScratch: [number, number, number] = [0, 0, 0];
  const bodyDirScratch: [number, number, number] = [0, 0, 0];
  const handRoll: [number, number, number] = [0, 0, 1];

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
  const grabTarget = new THREE.Vector3();
  const grabPlane = new THREE.Plane();
  const cameraForward = new THREE.Vector3();
  const ballPosition = new THREE.Vector3();

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

  /** True if the pointer ray passes through the marimo. Analytic, no raycast mesh. */
  function pointerHitsBall(nx: number, ny: number): boolean {
    pointerNdc.set(nx, ny);
    raycaster.setFromCamera(pointerNdc, camera);
    const centre = ballWorldPosition();
    const distance = raycaster.ray.distanceToPoint(centre);
    return distance <= env.radiusM * 1.35;
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
    waterVelocityAt(swirl, body.position[0], body.position[1], body.position[2], waterVelScratch);
    env.waterVel = waterVelScratch;
    env.waterOmegaY = waterSpinAt(swirl, body.position[0], body.position[2]);

    // Held: roll it against the plane facing the viewer, i.e. between your palms.
    if (grabbing) {
      camera.getWorldDirection(cameraForward);
      handRoll[0] = cameraForward.x;
      handRoll[1] = cameraForward.y;
      handRoll[2] = cameraForward.z;
      env.handRoll = handRoll;
    } else {
      env.handRoll = null;
    }

    rippleStepsOwed++;
    stirPhase += swirl.omegaY * dt;
    stirChop += RIPPLE_STIR_CHOP * dt;

    if (tumbleTimer > 0) {
      tumbleTimer -= dt;
      body.omega[0] = TUMBLE_OMEGA * 0.7;
      body.omega[2] = TUMBLE_OMEGA;
    }

    stepBody(body, env, dt);

    // Grab: a critically-ish damped spring toward the pointer.
    if (grabbing) {
      for (let axis = 0; axis < 3; axis++) {
        const target = axis === 0 ? grabTarget.x : axis === 1 ? grabTarget.y : grabTarget.z;
        const accel =
          (target - body.position[axis]) * GRAB_STIFFNESS - body.velocity[axis] * GRAB_DAMPING;
        body.velocity[axis] += accel * dt;
      }
    }

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
  /**
   * Millimetres of push per step, per millimetre of the bubble that made it.
   *
   * Size tells twice over, which is why the spread is as wide as it is: a bigger
   * bubble pushes harder *and* pushes on more water, since the kernel is laid
   * down at its own radius. The ring it leaves ends up going roughly as the
   * square of it.
   *
   * Bigger than it looks like it should be, because `rippleKernel` displaces no
   * net water and a source that displaces none is a far quieter radiator than
   * one that invents some — most of what it emits cancels against its own ring
   * before it gets anywhere. Correcting the volume cost about a factor of twenty
   * of reach, and this is paying it back.
   *
   * Measured across the range the jar actually makes — bubbles run 0.26 to
   * 1.35 mm and are heavily biased to the small end. A tenth of a second after
   * it goes, the smallest leaves a ring of about 0.07 mm, a middling one 0.33 mm
   * and the rare big one 1.2 mm; a seventeenfold spread, which is the point. All
   * of them are gone inside a second, because a ring that tight is short
   * wavelength and viscosity takes those first.
   */
  const RIPPLE_BURST_PUSH = 2;
  /** Steps a burst goes on pushing for. About a fiftieth of a second. */
  const RIPPLE_BURST_STEPS = 5;

  /** Bursts still in progress: x, z, radius, steps left. */
  const bursts: { x: number; z: number; radius: number; left: number }[] = [];

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
        radius: Math.max(surfacings[i + 2], 0.0015),
        left: RIPPLE_BURST_STEPS
      });
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const burst = bursts[i];
      rippleDrops.push({
        x: burst.x,
        z: burst.z,
        radius: burst.radius * 2.5,
        // Up on the first half, down on the second: the film lifts and the
        // cavity falls back in, which is what leaves a ring behind rather than
        // a permanent dimple.
        strength:
          (burst.left > RIPPLE_BURST_STEPS / 2 ? 1 : -1) * burst.radius * 1000 * RIPPLE_BURST_PUSH
      });
      if (--burst.left <= 0) bursts.splice(i, 1);
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

    tank.setRippleTexture(rippleSim?.texture ?? null);

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

    rippleSim?.step(renderer, rippleStepsOwed, collectRippleDrops());
    rippleStepsOwed = 0;

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

      if (pointerHitsBall(nx, ny)) {
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
    },

    setLighting(next) {
      lighting = next;
      applyCurrentLighting();
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
      particles.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    }
  };
}
