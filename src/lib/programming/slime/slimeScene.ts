import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type Jolt from 'jolt-physics';
import {
  AZIMUTH_START,
  BOX_HALF_X,
  BOX_HALF_Z,
  BOX_HEIGHT,
  CAMERA_DISTANCE,
  CAMERA_FOV_DEG,
  CAMERA_HEIGHT,
  CAMERA_TARGET_Y,
  CARE_TICK_SEC,
  FLOOR_Y,
  GRIME_CONTACT_DIST,
  HATCH_SEC,
  INITIAL_RADIUS_MM,
  MAX_SIM_SUBSTEPS,
  OAT_CLICK_RADIUS,
  OAT_MOLD_RAMP_SEC,
  OAT_MOLD_SEC,
  SIM_STEP_SEC,
  SLIME_OVERPRESSURE_DRY_PA,
  SLIME_OVERPRESSURE_WET_PA,
  TRAIL_CONTACT_HEIGHT
} from './constants';
import { mulberry32 } from '../marimo/rng';
import {
  applyMist,
  applySnack,
  applySparkle,
  canFeed,
  canSparkle,
  applyFeed,
  moodOf
} from './careSim';
import { catchUpToNow } from './catchUp';
import { createCaustic, type CausticBundle } from './caustic';
import { createClimb, type Climb, type ClimbInputs } from './climb';
import { PANE_COUNT, createGrimeMap, paneDistance, paneUv, type GrimeBundle } from './grimeMap';
import { createCondensation, type CondensationBundle } from './condensation';
import { createSqueegee, type SqueegeeBundle } from './squeegee';
import { createDof, type DofBundle } from './dof';
import { REGION_BOTTOM, buildEggMesh } from './eggMesh';
import { createEmotionMeter, type Emotion } from './emotion';
import type { BreedId } from './breeds';
import type { SlimeFinish } from './settings';
import { createEyes, type EyesBundle } from './eyes';
import { createInteraction, type Interaction } from './interaction';
import {
  createTerrariumWorld,
  type SlimeBody,
  type TerrariumBody,
  type TerrariumWorld
} from './joltWorld';
import { createParticleEyes, type ParticleEyesBundle } from './particleEyes';
import { createSolverBridge, type SolverBridge } from './solverBridge';
import { createParticleSkin, type ParticleSkinBundle } from './particleSkin';
import { flushGrime, flushSlime, loadSlime, loadTankSeed, readGrime, saveGrime, saveSlime } from './persist';
import { awayActivity, deserializeGrime, serializeGrime, simulateGrimeAway } from './grimePersist';
import { buildOatGeometry, createOatMaterial } from './oatMesh';
import { BALL_RADIUS, createBallMesh, type BallMeshBundle } from './ballMesh';
import { createSclerotium, type SclerotiumBundle } from './sclerotiumMesh';
import { createCrustShards, type CrustShardsBundle } from './crustShards';
import { createSlimeMesh, type SlimeMeshBundle } from './slimeMesh';
import { createSpray, type SprayBundle } from './spray';
import { createPowder, type PowderBundle } from './powder';
import { createDustPuff, type DustPuffBundle } from './dustPuff';
import { createTerrarium, type TerrariumBundle } from './terrariumMesh';
import { createSpringtails, type SpringtailsBundle } from './springtails';
import { applyRoomLighting, createRoomUniforms, isNightAt } from './roomLight';
import {
  DEFAULT_LIGHT_LEVEL,
  DEFAULT_LIGHT_SOURCE_ID,
  DEFAULT_ROOM_TONE,
  resolveLighting,
  type ResolvedLighting
} from '../marimo/lighting';
import { createTrailMap, type TrailBundle } from './trailMap';
import { createVolumeMaterial, type VolumeMaterialBundle } from './volumeMaterial';
import type { CatchUpResult, SlimeState } from './types';

/**
 * The whole terrarium: renderer, meshes, the motion clock, and the bridge to
 * the care clock.
 *
 * Shaped like `marimoScene.ts`, which is shaped like `candleScene.ts`: a plain
 * factory returning an interface, owning no Svelte state. The host component
 * drives it with a RAF loop and reads back a snapshot for the UI.
 *
 * The lifecycle stage machine lives in `careSim.ts`; what lives here is its
 * *scenery* — which bodies exist. A sclerotium has no soft body at all, just
 * the crust mesh; `waking` spawns the soft body deflated and inflates it as
 * the hatch progresses (the ooze-out is nothing but the pressure ramp); a
 * recrust removes the body again. Both swaps happen at rest by construction,
 * because both ends of each transition are calm states.
 */

/** Window the FPS readout counts over. See marimoScene for the reasoning. */
const FPS_WINDOW_SEC = 0.5;
/** Gaps longer than this are a paused loop resuming, not a slow frame. */
const FPS_DISCONTINUITY_SEC = 0.5;

/** The spray's pressure pulse: a brief happy plump, skipped in reduced motion. */
const SPRAY_PULSE_SEC = 0.6;
const SPRAY_PULSE_GAIN = 0.12;

/**
 * How long the engulf takes once the flake is caught: drawn per meal from
 * this range, leaning toward the quick end when hungry (a starving slime
 * gobbles; a comfortable one savors) with a dash of randomness.
 */
const ENGULF_MIN_SEC = 5;
const ENGULF_MAX_SEC = 10;

/** How long the eyes hold on a poked spot before drifting back to the room. */
const POKE_LOOK_SEC = 2.4;
/** Pokes this close together are one bout for the notice counter. */
const POKE_BOUT_SEC = 4;
/** The eyes' swim to the poked spot eases over roughly this long — brisk
 * enough to read as attention, slow enough to watch them travel. */
const POKE_LOOK_EASE_SEC = 0.35;
/** The gaze's drift between the room and the will's current errand — slow
 * enough that attention shifts read as noticing, not snapping. */
const ATTENTION_EASE_SEC = 0.6;

/**
 * The particle pivot's master switch: with it on, the active-stage body is
 * the position-based particle body (`pbdWorld`) skinned by the shrink-wrap
 * icosphere and driven by the velocity-field hand — actual goo, no spring
 * mesh anywhere. The Jolt soft-body path stays intact behind the flag until P4
 * retires it.
 */
const USE_PARTICLES = true;

export type SceneVariant = 'full' | 'ambient';

/** What the pointer is holding. The drawer picks; the scene obeys. */
export type SlimeTool = 'hand' | 'pet' | 'mister' | 'oats' | 'mica' | 'squeegee';

export interface SlimeSnapshot {
  state: SlimeState;
  displayFps: number;
  grabbing: boolean;
  canFeed: boolean;
  /** A flake is out — falling, luring, being eaten, or moldering. */
  feeding: boolean;
  /** The flake out there has gone over, and wants clicking away. */
  moldy: boolean;
  /** Mean grime on the dirtiest pane, 0..1 — the drawer's nudge to squeegee.
   * The worst of all four, because the orbit reaches all four. */
  grimeWorst: number;
  /** Awake and not yet at full pearl — the mica shaker is worth offering. */
  canSparkle: boolean;
  /** The slime is off on one of its own trips (ambling or climbing). */
  roaming: boolean;
  /** The play ball is out in the tank. */
  ballOut: boolean;
}

export interface SlimeScene {
  renderer: THREE.WebGLRenderer;
  resize(): void;
  render(timeMs: number): SlimeSnapshot;
  dispose(): void;

  /** Pointer positions are normalised device coords in [-1, 1]. */
  pointerDown(nx: number, ny: number, orbit: boolean): void;
  pointerMove(nx: number, ny: number): void;
  pointerUp(): void;

  /**
   * A misting: care effect plus the theatre. With `ndc`, the burst is aimed
   * where the pointer points (the mister tool); without, at the pet.
   */
  spray(ndc?: readonly [number, number]): void;
  /**
   * Drop an oat flake, if it is awake and hungry. With `ndc`, the flake
   * falls over the pointed-at spot — aim well, or the meal sits where it
   * lands until it is quietly tidied away.
   */
  feed(ndc?: readonly [number, number]): void;
  /**
   * A pinch of mica flakes over the pointed-at spot (or the pet): powder
   * theatre plus a step of earned sparkle, up to full pearl at 1.
   */
  sprinkle(ndc?: readonly [number, number]): void;
  /** Swap what the pointer is holding. */
  setTool(tool: SlimeTool): void;
  /**
   * The toy box: drop the play ball in from a random spot along the tank's
   * rim, or — if it is already out — put it away. Clicking the ball itself
   * boots it off in a random bounce instead (see pointerDown).
   */
  toggleBall(): void;

  /** Bring the pet up to date and write it out now, for pagehide and tab-hide. */
  flush(): void;
  /** Damp or undamp the motion without rebuilding anything. */
  setReducedMotion(reduced: boolean): void;
  /** Live material tuning: multipliers on viscosity, pressure, and the
   * shape-matching drive, 1 = stock. */
  setTuning(viscosity: number, pressure: number, shape: number): void;
  /**
   * How the earned mica reads, both 0..1: `size` from fine dust to coarse
   * glitter, `amount` from stray specks to a dense suspension. The shimmer's
   * *strength* is not a setting — it is the pet's own `sparkle`, earned by
   * sprinkling.
   */
  setMicaLook(size: number, amount: number): void;
  /** Debug colour grade on the body's tint: hue shift in degrees
   * (-180..180), saturation and lightness multipliers (0..2, 1 = stock). */
  setColorGrade(hueDegrees: number, saturation: number, lightness: number): void;
  /** One of the four material archetypes; `jelly` is the stock look. */
  setFinish(finish: SlimeFinish): void;
  /**
   * Stamp the ordered breed into the pet (arrival paperwork — see
   * `breeds.ts`). Written through immediately: a pedigree lost to a closed
   * tab would mean re-asking, and the picker only shows once.
   */
  setBreed(id: BreedId): void;
  /** Repaint the room and relamp the rig — the marimo's lighting settings,
   * resolved by `resolveLighting`. */
  setLighting(lighting: ResolvedLighting): void;
  /**
   * Whether the tank is in view. While false, care still ticks but the
   * crust-to-waking hatch is held — nobody should miss their slime waking up.
   */
  setWitnessed(watching: boolean): void;

  /** Advance the pet's clock by hand. Dev only — uses the production path. */
  timeTravel(ms: number): CatchUpResult;
  /**
   * Skip the soak and start the hatch right now. Debug only — the crust
   * cracks into `waking` immediately and the emergence plays from there on
   * the production path. A no-op unless the pet is a sclerotium.
   */
  emerge(): void;
  /**
   * Curl the pet back up into a dormant sclerotium right now. Debug only —
   * the days of drought are skipped, but the transition writes the same
   * fields the production recrust in `stepCare` does, so the crust that
   * results is a real one. A no-op if the pet is already a sclerotium.
   */
  recrust(): void;
  /** The "while you were away" result from load, consumed once. */
  takeArrivalResult(): CatchUpResult | null;
}

export interface SlimeSceneOptions {
  /**
   * The physics engine, already loaded. Taken rather than loaded here for the
   * same reason as the marimo tank: it is two megabytes of WebAssembly behind
   * a promise, and the host waits for it once. See `loadJolt`.
   */
  jolt: typeof Jolt;
  variant?: SceneVariant;
  reducedMotion?: boolean;
}

export function createSlimeScene(container: HTMLElement, options: SlimeSceneOptions): SlimeScene {
  let reducedMotion = options.reducedMotion ?? false;
  let motionScale = reducedMotion ? 0.3 : 1;

  // ------------------------------------------------------------------- state
  const loaded = loadSlime(Date.now());
  const state = loaded.state;
  // The absence is unwitnessed by definition: a soak that finished while the
  // page was closed holds at the brink here and hatches on the first live
  // tick, in front of the visitor.
  let arrivalResult: CatchUpResult | null = loaded.arrived
    ? null
    : catchUpToNow(state, Date.now(), { witnessed: false });
  // A newly arrived crust is committed straight away, for the same reason a
  // newly hatched marimo is: losing it to a closed tab would swap the pet.
  if (loaded.arrived) flushSlime(state);
  const seed = state.seed;

  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Shadow maps are what make the moss bed read as *lit*: tufts shading
  // their neighbours, the stone and the pet grounding themselves on the bed.
  // Updated by hand once per frame — the frame renders the scene three times
  // (interior, back depth, screen), and the map is the same for all three.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101214);

  // An environment for the physical materials: transmission and clearcoat
  // have almost nothing to reflect under three point lights alone, and a
  // wet slime is mostly made of reflections. The stock room, prefiltered
  // once, dimmed to match the dark study the box sits in.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.5;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.005, 3);

  let azimuth = AZIMUTH_START;

  function placeCamera() {
    camera.position.set(
      CAMERA_DISTANCE * Math.sin(azimuth),
      FLOOR_Y + CAMERA_HEIGHT,
      CAMERA_DISTANCE * Math.cos(azimuth)
    );
    camera.lookAt(0, FLOOR_Y + CAMERA_TARGET_Y, 0);
  }

  // ------------------------------------------------------------------ lights
  // Ordinary Three lighting, which the marimo never had the option of: its
  // light was the water. A dry box wants a soft key from above-left, a dim
  // fill from the room, and hemisphere bounce off the substrate.
  // Brighter than the first draft on purpose: the volume material samples
  // the *lit scene* through the jelly, so the moss bed's brightness is the
  // slime's brightness.
  const hemisphere = new THREE.HemisphereLight(0xf4efe6, 0x2a2620, 0.8);
  scene.add(hemisphere);
  // The key sits high and well off to the left, so its highlight lands on
  // the dome's upper shoulder — the first position was nearly frontal and
  // parked a white blob squarely between the eyes.
  const key = new THREE.DirectionalLight(0xfff2df, 2.3);
  key.position.set(-0.16, 0.2, 0.05);
  // The key is the one shadow caster. The frustum hugs the tank (the world
  // is centimetres across), so the 1024 map spends all its texels here:
  // a texel lands around 0.2 mm — fine enough for millimetre moss tufts.
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -0.1;
  key.shadow.camera.right = 0.1;
  key.shadow.camera.top = 0.1;
  key.shadow.camera.bottom = -0.1;
  key.shadow.camera.near = 0.05;
  key.shadow.camera.far = 0.6;
  // Biases sized to that texel, not to a metre-scale scene: a couple of
  // texels of normal offset kills acne without lifting tufts off their
  // own shadows.
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.0005;
  scene.add(key);
  const keyDirWorld = key.position.clone().normalize();
  const fill = new THREE.DirectionalLight(0xcfd8e0, 0.65);
  fill.position.set(0.1, 0.06, -0.08);
  scene.add(fill);

  // The room block: one set of uniform values shared by reference across the
  // backdrop dome, both glass panes, the pedestal and the volume material, so
  // `applyRoomLighting` repaints all of them with one write. Applied once now
  // with the defaults; the host pushes the stored settings right after
  // creation, the same way it pushes tuning and mica.
  const roomUniforms = createRoomUniforms();
  /** The settings-resolved lighting; the night check lays over it live. */
  let lighting: ResolvedLighting = resolveLighting({
    lightSource: DEFAULT_LIGHT_SOURCE_ID,
    lightLevel: DEFAULT_LIGHT_LEVEL,
    roomTone: DEFAULT_ROOM_TONE
  });
  /** Whether the visitor's clock says the lamp is off — re-read on a slow
   * cadence in the render loop; a flip repaints the room. */
  let nightNow = isNightAt(new Date().getHours());
  let nightCheckSec = 0;
  function applyLightingNow(): void {
    applyRoomLighting(roomUniforms, { hemisphere, key, fill }, lighting, nightNow);
    // The pet's dried trails phosphoresce only in a truly dark room — the
    // whole point of checking on it before bed. (Guarded: the trails mesh
    // is built a few lines below this function's first call.)
    trails?.setGlow(nightNow && lighting.tone === 'dark' ? 1 : 0);
  }
  applyRoomLighting(roomUniforms, { hemisphere, key, fill }, lighting, nightNow);

  // ------------------------------------------------------------------ meshes
  const grime: GrimeBundle = createGrimeMap();
  scene.add(grime.group);

  const condensation: CondensationBundle = createCondensation();
  scene.add(condensation.group);

  /** Damp glass re-wets dried slime: at full fog the smears dissolve four
   * times faster than on dry glass — misting the tank is a lazy half-clean,
   * the squeegee remains the real one. */
  const grimeDampScale = () => 1 + 3 * condensation.field.fog;
  // The panes remember. Last visit's film comes back dried-on, and the
  // absence itself is simulated: an active slime kept climbing while nobody
  // watched. Seeded off the pet and the (already re-anchored) tick clock so
  // one absence always replays the same past.
  {
    const storedGrime = readGrime();
    if (storedGrime) deserializeGrime(storedGrime, grime.field);
    simulateGrimeAway(
      grime.field,
      arrivalResult?.elapsedSec ?? 0,
      awayActivity(state.stage, state.vigor),
      (seed ^ Math.floor(state.lastTickAt / 1000)) >>> 0
    );
  }

  // The tank's furniture is the *browser's*, not the pet's: everyone gets
  // their own lie of the land, and it survives ordering a new slime.
  const terrarium: TerrariumBundle = createTerrarium(loadTankSeed(), roomUniforms);
  scene.add(terrarium.group);
  placeCamera();


  const trails: TrailBundle = createTrailMap();
  scene.add(trails.mesh);

  const crust: SclerotiumBundle = createSclerotium(seed);
  scene.add(crust.group);

  // The shatter chips: plates that break loose during the emergence and
  // tumble off the crust (crustShards.ts). Skipped under reduced motion —
  // the crust shader's quiet dissolve is the fallback.
  const crustShards: CrustShardsBundle = createCrustShards(seed, (x, z) => crust.surfaceY(x, z));
  scene.add(crustShards.group);

  const sprayFx: SprayBundle = createSpray();
  scene.add(sprayFx.points);

  const powderFx: PowderBundle = createPowder();
  scene.add(powderFx.points);

  const dustFx: DustPuffBundle = createDustPuff();
  scene.add(dustFx.points);

  // The play ball: dropped from the drawer, simulated in the solver worker
  // beside the body it plays with, rendered here from snapshot poses.
  const ballMesh: BallMeshBundle = createBallMesh(loadTankSeed());
  ballMesh.mesh.castShadow = true;
  scene.add(ballMesh.mesh);

  // Grown to the size the care clock says. Read once; growth earned during a
  // session shows up on the next visit rather than resizing a live body.
  const egg = buildEggMesh(state.radiusMm / INITIAL_RADIUS_MM);
  const slimeMesh: SlimeMeshBundle = createSlimeMesh(egg);
  // The pet grounds itself on the moss with a real cast shadow (the depth
  // pre-pass three runs for casters ignores the volume material, which is
  // exactly right — the shadow is the silhouette).
  slimeMesh.mesh.castShadow = true;
  scene.add(slimeMesh.mesh);

  const eyes: EyesBundle = createEyes(egg, seed);
  scene.add(eyes.group);
  /** Whether the pet's stage wants eyes at all; the passes toggle the group. */
  let eyesPresent = false;

  // The particle body's eyes: features of the creature, not of the material
  // (see particleEyes.ts). Only one pair is ever live.
  const particleEyes: ParticleEyesBundle = createParticleEyes(seed, keyDirWorld);
  scene.add(particleEyes.group);
  // Both pairs start hidden: eyes exist only when the stage says so, and
  // the visibility is owned by the render passes — before a body exists
  // the plain render path must find nothing to draw.
  eyes.group.visible = false;
  particleEyes.group.visible = false;

  // ----------------------------------------------------- volume shading rig
  // See volumeMaterial.ts and SHADING.md: the slime draws with a measured-
  // thickness volume material, fed by an interior colour pass and a
  // back-face depth pass. The genome MeshPhysicalMaterials the mesh was
  // built with stay behind as the fallback path.
  const volume: VolumeMaterialBundle = createVolumeMaterial(keyDirWorld, roomUniforms);
  slimeMesh.mesh.material = volume.material;

  // The particle body's skin: a shrink-wrapped icosphere wearing the same
  // volume material — the whole shading rig survives the physics pivot.
  const surface: ParticleSkinBundle = createParticleSkin();
  surface.mesh.castShadow = true;
  surface.mesh.material = volume.material;
  surface.mesh.visible = false;
  scene.add(surface.mesh);

  /** Interior pass target: everything except the slime's own surface. */
  let sceneTarget: THREE.WebGLRenderTarget | null = null;
  /** Back-face depth target. */
  let backTarget: THREE.WebGLRenderTarget | null = null;
  /** The screen pass, when it detours through depth of field. */
  let frameTarget: THREE.WebGLRenderTarget | null = null;
  /** Whether the shadow map has been rendered at least once (see the
   * priming pass in the render loop — a Safari appeasement). */
  let shadowMapPrimed = false;

  function ensureTargets(width: number, height: number): void {
    if (sceneTarget && sceneTarget.width === width && sceneTarget.height === height) return;
    sceneTarget?.dispose();
    backTarget?.dispose();
    frameTarget?.dispose();
    // The interior pass keeps its depth as a texture too: it is the "world
    // without the slime" depth the DoF pass focuses with.
    // FloatType = DEPTH_COMPONENT32F: Safari's Metal backend refuses to
    // sample the default DEPTH_COMPONENT24 with a float sampler2D
    // ("Mismatch between texture format and sampler type"), and every draw
    // under a program reading uSceneDepth/uBackDepth silently dropped —
    // 32F samples as float everywhere and the shader reads are unchanged.
    sceneTarget = new THREE.WebGLRenderTarget(width, height, {
      depthTexture: new THREE.DepthTexture(width, height, THREE.FloatType)
    });
    backTarget = new THREE.WebGLRenderTarget(width, height, {
      depthTexture: new THREE.DepthTexture(width, height, THREE.FloatType)
    });
    frameTarget = new THREE.WebGLRenderTarget(width, height);
  }

  // The back-depth pass renders the slime's far side alone, into its own
  // little scene: a second mesh sharing the live geometry, so the pass costs
  // no extra vertex work beyond the draw itself.
  const depthScene = new THREE.Scene();
  const backDepthMaterial = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    colorWrite: false
  });
  const backMesh = new THREE.Mesh(
    USE_PARTICLES ? surface.mesh.geometry : slimeMesh.mesh.geometry,
    backDepthMaterial
  );
  backMesh.frustumCulled = false;
  // Both skins write world-space positions at identity, so sharing the
  // geometry is the whole story — no transform to mirror.
  depthScene.add(backMesh);

  /** The digestion cloud's driver: rises with the engulf, fades after. */
  let digestValue = 0;
  const oatViewScratch = new THREE.Vector3();
  const flakeDrawScratch = new THREE.Vector3();
  const oatWorldScratch = new THREE.Vector3();
  const drawSizeScratch = new THREE.Vector2();
  const focusScratch = new THREE.Vector3();

  const caustic: CausticBundle = createCaustic();
  scene.add(caustic.mesh);
  const dof: DofBundle = createDof();

  // ----------------------------------------------------------------- physics
  const world: TerrariumWorld = createTerrariumWorld(options.jolt);

  const squeegee: SqueegeeBundle = createSqueegee(world, grime, condensation);
  scene.add(squeegee.group);

  // The river rocks, physically: static convex hulls in the Jolt world,
  // built from the same geometry they are drawn with. The springtails
  // collide with these for real — walking, pinging, and mid-ptooey.
  for (const rock of terrarium.rocks) {
    world.addStaticHull(rock.points, [rock.x, rock.y, rock.z], rock.yaw);
  }

  // The cleanup crew lives in the tank, not on the pet: seeded by the same
  // tank id, riding the same heightfield — and its bodies live in the Jolt
  // world with everything else. The rock circles it still gets are for
  // respawn placement only; collision is the hulls' job now.
  const springtails: SpringtailsBundle = createSpringtails(
    loadTankSeed(),
    terrarium.groundHeightAt,
    terrarium.rocks,
    world
  );
  springtails.setMotionScale(motionScale, !reducedMotion);
  scene.add(springtails.mesh);

  /** The soft body and its hand — present only while the slime is out of its crust. */
  let slime: SlimeBody | null = null;
  let interaction: Interaction | null = null;
  /** The will — the slime's own trips. Lives and dies with the body. */
  let climb: Climb | null = null;
  /** Whether the will was out on a trip at the last step. */
  let roaming = false;

  /**
   * The continuum body and its hand (USE_PARTICLES), with per-particle scratches.
   * The solver itself lives in a worker on its own 120 Hz clock; `solver` is
   * the bridge, and `particles`/`particleHand` alias it while the body exists so every
   * call site reads exactly as it did when the solver was in-loop. Nothing
   * here calls `step` any more — the scene just reads the freshest snapshot.
   */
  const solver: SolverBridge = createSolverBridge();
  // The tank's rocks are furniture: told to the solver once, kept across
  // respawns worker-side.
  solver.setRocks(
    terrarium.rocks.map((r) => ({ x: r.x, y: r.y, z: r.z, yaw: r.yaw, stone: r.stone }))
  );
  let particles: SolverBridge | null = null;
  /** Remembered across body rebuilds — a respawn keeps the user's tuning. */
  // ------------------------------------------------------------- mica swirl
  // The pigment's swirl phase advances with the body's own stirring: a poke
  // churns the flakes, a resting body lets them drift. Agitation is the mean
  // speed of a strided sample of particles, smoothed so the churn tails off
  // rather than stopping dead.
  // Strength is the pet's own earned sparkle; only the look is a setting.
  let micaStrength = Math.min(1, Math.max(0, state.sparkle));
  volume.setMica(micaStrength);
  let micaPrev: Float32Array | null = null;
  let micaAgitation = 0;
  let swirlPhase = 0;
  /** Idle drift, phase units per second. */
  const SWIRL_BASE = 0.3;
  /** How much a fully agitated body speeds the churn. */
  const SWIRL_STIR = 2.6;

  let tuningViscosity = 1;
  let tuningPressure = 1;
  let tuningShape = 1;
  let particleHand: SolverBridge['hand'] | null = null;
  let particlePositions = new Float32Array(0);
  let particlePrev = new Float32Array(0);
  let particlePrevValid = false;
  let particleContactScratch = new Float32Array(0);
  let particleGrimeScratch = new Float32Array(0);
  const particlePokeArg = { point: [0, 0, 0] as [number, number, number], ease: 0 };

  /** Whichever hand is live — the one truth for "is the player holding it". */
  function handState(): string {
    return USE_PARTICLES ? (particleHand?.state() ?? 'idle') : (interaction?.state() ?? 'idle');
  }

  const vertexScratch = new Float32Array(egg.vertexCount * 3);
  /** World xz pairs of bottom vertices touching the floor, refreshed per frame. */
  const contactScratch = new Float32Array(egg.vertexCount * 2);
  /** (pane, u, v, slide) per vertex pressed against glass, refreshed per frame. */
  const grimeContactScratch = new Float32Array(egg.vertexCount * 4);
  /** Last frame's vertices, for the smear speed. Valid once a frame has run. */
  const prevVertexScratch = new Float32Array(egg.vertexCount * 3);
  let prevVertexValid = false;
  const slimeCenter: [number, number, number] = [0, FLOOR_Y, 0];

  /** Reused every climb step; `center` aliases `slimeCenter` on purpose. */
  const climbInputs: ClimbInputs & {
    center: [number, number, number];
    food: [number, number, number] | null;
  } = {
    center: slimeCenter,
    handBusy: false,
    zest: 0,
    moisture: 0,
    speed: 1,
    food: null
  };
  const foodScratch: [number, number, number] = [0, 0, 0];

  function spawnSlimeBody(): void {
    if (USE_PARTICLES) {
      if (particles) return;
      solver.spawn();
      particles = solver;
      particles.setTuning(tuningViscosity, tuningPressure, tuningShape);
      particleHand = solver.hand;
      particleHand.setMotionScale(motionScale);
      particlePositions = new Float32Array(particles.particleCount * 3);
      particlePrev = new Float32Array(particles.particleCount * 3);
      particlePrevValid = false;
      particleContactScratch = new Float32Array(particles.particleCount * 2);
      particleGrimeScratch = new Float32Array(particles.particleCount * 4);
      applyCareToBody();
      return;
    }
    if (slime) return;
    slime = world.addSlime(egg, [0, FLOOR_Y + 0.002, 0]);
    interaction = createInteraction(world, slime, egg);
    interaction.setMotionScale(motionScale);
    climb = createClimb(world, slime, egg, seed);
    applyCareToBody();
  }

  function removeSlimeBody(): void {
    if (USE_PARTICLES) {
      solver.despawn();
      particles = null;
      particleHand = null;
      particlePrevValid = false;
      return;
    }
    if (!slime) return;
    interaction?.dispose();
    interaction = null;
    climb?.dispose();
    climb = null;
    roaming = false;
    world.removeSlime(slime);
    slime = null;
  }

  // ----------------------------------------------------------- the watchdog
  /**
   * The last line of defence, promised in the original plan's risk table and
   * finally earned: if the soft body ever shreds — NaN vertices, or geometry
   * flung outside any plausible bounds — it is torn down and respawned at
   * rest, care state untouched. Solver explosions are one-frame events, not
   * permanent hauntings: the pet quietly pulls itself back together.
   *
   * The bounds are generous (a hand can legitimately lift the slime well
   * above the box), and the cooldown stops a persistently sick solver from
   * rebuilding sixty times a second.
   */
  let watchdogCooldownSec = 0;

  function slimeLooksShredded(): boolean {
    for (let i = 0; i < egg.vertexCount; i++) {
      const x = vertexScratch[i * 3];
      const y = vertexScratch[i * 3 + 1];
      const z = vertexScratch[i * 3 + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return true;
      if (Math.abs(x) > 0.3 || Math.abs(z) > 0.3) return true;
      if (y > FLOOR_Y + 0.35 || y < FLOOR_Y - 0.05) return true;
    }
    return false;
  }

  // --------------------------------------------------------------- the flake
  // Geometry and material live in oatMesh.ts — the flake earned its own
  // file the day it stopped being a box. The scene drives its two life
  // events through the material's uniforms.
  const oatGeometry = buildOatGeometry(seed);
  const oatMaterial = createOatMaterial();
  const flakeDigestUniform = oatMaterial.digest;
  const flakeMoldUniform = oatMaterial.mold;
  let flake: {
    body: TerrariumBody;
    mesh: THREE.Mesh;
    age: number;
    /** null while falling; engulf progress 0..engulfSec once caught. */
    engulfing: number | null;
    /** This meal's duration, rolled when the engulf starts. */
    engulfSec: number;
  } | null = null;

  const flakePose: [number, number, number] = [0, 0, 0];
  const flakeQuat: [number, number, number, number] = [0, 0, 0, 1];
  const flakeVelocity: [number, number, number] = [0, 0, 0];
  // The pseudopod: how far the feeding tongue has extended, 0..1. The tip
  // walks out from the body toward the flake as this rises, and the solver's
  // tendril attractor pulls a stream of particles after it — the skin wraps
  // that stream into the gooey tongue the player actually sees.
  let tendrilReach = 0;
  /** Whether the solver currently holds a tendril, so clears send once. */
  let tendrilOn = false;

  function removeFlake(): void {
    if (!flake) return;
    world.remove(flake.body);
    scene.remove(flake.mesh);
    flake = null;
  }

  // ---------------------------------------------------------------- emotion
  // The session mood (see emotion.ts): valence and arousal, fed by the care
  // state and by events (pokes, sprays, meals, being carried), and read by
  // the material, the skin's ripple, the eyes and the will.
  const emotionMeter = createEmotionMeter();
  let mood: Emotion = { valence: 0.5, arousal: 0 };
  /** The skin's emotional ripple phase, advanced faster when aroused. */
  let wavePhase = 0;
  /** Session clock for the amble scheduler, seconds. */
  let sceneSec = 0;
  // The amble: an aroused, content slime sometimes picks a spot and oozes
  // there for no reason but its own. Food and the hand always outrank it.
  const emotionRand = mulberry32((seed ^ 0x3a7e) >>> 0);
  let nextAmbleAt = 20 + emotionRand() * 20;
  let ambleUntil = 0;
  const ambleTarget: [number, number] = [0, 0];
  // The popcorn: a genuinely excited, happy slime pops off the floor in a
  // little burst of short hops, the way a delighted young mouse popcorns.
  // Same scheduler idiom as the amble; the hand and a meal outrank it, and
  // reduced motion keeps the pet's feet on the ground for good.
  let nextPopcornAt = 15 + emotionRand() * 15;
  let popcornHopsLeft = 0;
  let nextPopHopAt = 0;

  // ------------------------------------------------------------ the play ball
  // The toy out in the tank. The pet plays in *bouts* — a stretch of chasing
  // and nosing the ball, then a rest — on the amble's own scheduler idiom,
  // so a ball left out overnight is company, not a treadmill. A nudge (the
  // ball suddenly scooting while the body is on it) is a little delight.
  let ballOut = false;
  let playUntil = 0;
  let nextPlayAt = 0;
  // Chasing springtails: the toyless game. A content, well-fed slime
  // sometimes picks the nearest critter and ambles after it; the critter
  // pings away on its furcula, the chase retargets, nobody gets eaten.
  // Bouts on the ball's scheduler idiom — a stretch of tag, then a rest.
  let chaseIdx = -1;
  let chaseUntil = 0;
  let nextChaseAt = 30 + emotionRand() * 30;
  // The perch: a damp, content slime sometimes climbs one of the tank's
  // rocks and sits up there a while — the old glass-climb's wanderlust,
  // pointed at the furniture. The scene only parks the lure on the rock's
  // footprint; the actual ascent is the solver's grip-haul (moisture is
  // grip, so a dry crust never gets asked). Bouts on the amble scheduler
  // idiom; food, the hand, and every game outrank it.
  let perchRock = -1;
  let perchUntil = 0;
  let nextPerchAt = 45 + emotionRand() * 45;
  // The gaze's tie to the will: whatever errand holds the lure also holds
  // the eyes — the meal, the ball, the quarry, the rock being climbed.
  // Strength eases so attention drifts on and off; the hand's poke and the
  // spit-watch still outrank it, layered after in the gaze blend.
  const attentionWorld = new THREE.Vector3();
  let attentionWant = 0;
  let attentionEase = 0;
  let chaseThrillCooldownSec = 0;
  // The slurp-and-ptooey: a chase that actually corners its quarry sucks
  // the critter in, savors it a beat, and spits it out in a lofted arc.
  // The critter is safe the whole time; the indignity is the game.
  let heldIdx = -1;
  let heldUntil = 0;
  /** The hold's full length, for the telegraph envelope's clock. */
  let heldDur = 1;
  /** True while the savor pulse is riding the particle tuning. */
  let telegraphActive = false;
  /** ±envelope of the savor squash-and-swell, -1..1, 0 when idle. */
  let savorEnv = 0;
  const SAVOR_PULSE_GAIN = 0.1;
  // The eyes follow the show: which critter is mid-ptooey, and how hard
  // the gaze leans toward it (eases in on launch, lingers after landing).
  let spitWatchIdx = -1;
  let spitLookEase = 0;
  const SPIT_LOOK_EASE_SEC = 0.25;
  const spitWorld = new THREE.Vector3();
  /** Last frame's ball position, for the nudge detector. Valid while out. */
  const ballPrev: [number, number, number] = [0, 0, 0];
  let ballPrevValid = false;
  let nudgeCooldownSec = 0;
  /** Click-to-kick reach around the ball, metres (the oat's idiom). */
  const BALL_CLICK_RADIUS = 0.014;
  /** Ball motion past this, beside the body, reads as "it batted it". */
  const NUDGE_SPEED = 0.025;

  function putBallAway(): void {
    if (!ballOut) return;
    ballOut = false;
    ballPrevValid = false;
    ballMesh.mesh.visible = false;
    solver.clearBall();
  }

  // ------------------------------------------------------------- care bridge
  let careAccumulator = 0;
  let sprayPulse = 0;
  // Seconds until the last spray burst reaches the pet; the moisture change
  // and the reaction hold until then.
  let mistInFlightSec = 0;

  function mistLands(): void {
    mistInFlightSec = 0;
    applyMist(state, Date.now());
    // A misting is refreshing: a lift and a little thrill.
    emotionMeter.excite(0.25, 0.15);
    if (!reducedMotion && state.stage === 'active') sprayPulse = SPRAY_PULSE_SEC;
    careTick();
    flushSlime(state);
  }
  let supplenessBucket = -1;
  let breathPhase = 0;
  /**
   * How droopy the held body is, 0..1, eased. A slime lifted clear of the
   * floor relaxes toward a teardrop: its pressure is let down by almost half
   * while it dangles, and plumps back the moment it touches down. Purely a
   * scene-side read of "grabbing with no floor contact" — the physics
   * thread's harness drives the world directly and never sees this.
   */
  let heldDroop = 0;
  let lastFloorContacts = 1;

  /**
   * The hatch clock, 0 → 1 across the waking stage, smooth. `revival` only
   * advances on the one-second care tick, which made the whole emergence
   * step like a slideshow; the render clock fills in the fraction between
   * ticks, so the crust dissolve and the pressure ramp glide.
   */
  function hatchProgress(): number {
    if (state.stage !== 'waking') return state.stage === 'active' ? 1 : 0;
    return Math.min(1, state.revival + careAccumulator / HATCH_SEC);
  }

  /**
   * The waking body's spawn is an orb at full rest shape — instant, and
   * wrong for an emergence. So the first stretch of the hatch is the
   * *cracking*, played blind: the body spawns at zero tone (pure liquid,
   * no will to be a mound) and slumps flat while its skin is still hidden,
   * and above it the crust heaves and its seams pry wide with living olive
   * showing through — something is swelling underneath. Only at this
   * fraction of the hatch does the shatter start and the skin reveal — a
   * low puddle where the first plates break loose — and the tone ramp
   * gathers it into the orb over the rest of the waking.
   */
  const HATCH_REVEAL = 0.12;

  /**
   * The growing-in, as a fraction of the hatch after the reveal. A newborn
   * is small, dark and flat; over this window (~10 s of the 20 s hatch) it
   * rounds up, swells to full size and clears from murky olive to pale
   * sea-glass — then spends the rest of the waking simply being itself
   * until the eyes arrive.
   */
  const HATCH_GROW = 0.5;

  /** 0 just revealed → 1 grown in, eased so the change starts brisk and lands soft. */
  function growProgress(): number {
    if (state.stage !== 'waking') return 1;
    const linear = Math.min(1, Math.max(0, (hatchProgress() - HATCH_REVEAL) / HATCH_GROW));
    return 1 - (1 - linear) * (1 - linear);
  }

  /** Tone/pressure ramp for the hatch: 0 through the blind stretch, then 0 → 1. */
  function hatchRampNow(): number {
    if (state.stage !== 'waking') return 1;
    return Math.max(0.03, growProgress());
  }

  /** Push the care state at the physics and materials. Cheap, called per tick. */
  function applyCareToBody(): void {
    // Sparkle drains on the care clock (settling, rinsing, molting), so the
    // shimmer follows the state rather than only changing at sprinkle time.
    // Above the body checks on purpose: a crust that molted its finery goes
    // plain even though there is no body to tune.
    if (state.sparkle !== micaStrength) {
      micaStrength = state.sparkle;
      volume.setMica(micaStrength);
    }
    if (USE_PARTICLES) {
      if (!particles) return;
      // The hatch is the tone ramp: a waking slime gathers itself into a
      // mound as the hatch clock runs 0 → 1 — the ooze-together is the animation.
      const hatchRamp = hatchRampNow();
      // Care → material, the coupling the research doc promised would get
      // better under MPM: a dry slime is literally stiffer goo that holds
      // its dents (higher yield memory); tone — the will to be a mound —
      // runs on vigor, so a parched, listless pet sags flat.
      particles.setMaterialScale(
        1 + 0.5 * (1 - state.moisture),
        1 + 1.5 * (1 - state.moisture),
        hatchRamp * (0.45 + 0.55 * state.vigor)
      );
      return;
    }
    if (!slime) return;
    // The hatch is the pressure ramp: a waking slime inflates from nearly
    // flat as the hatch clock runs 0 → 1, and that ooze-out *is* the animation.
    const hatchRamp = hatchRampNow();
    // The pulse eases in and back out (a half-sine over its life) so the
    // plump-up on landing is a swell, not a step.
    const pulse =
      sprayPulse > 0
        ? 1 + SPRAY_PULSE_GAIN * Math.sin(Math.PI * (1 - sprayPulse / SPRAY_PULSE_SEC))
        : 1;
    // The idle breath: ±3% of pressure on a slow swell. It keeps the body
    // awake, which is the point — a pet holds still, a paperweight sleeps.
    // Absent under reduced motion, where the slime is allowed to truly rest.
    const breath =
      state.stage === 'active' && !reducedMotion ? 1 + 0.03 * Math.sin(breathPhase * 1.1) : 1;
    const pascals =
      SLIME_OVERPRESSURE_DRY_PA +
      (SLIME_OVERPRESSURE_WET_PA - SLIME_OVERPRESSURE_DRY_PA) * state.moisture;
    // Dangling goo: see heldDroop. Held clear of the floor, the body lets
    // itself down toward a teardrop.
    const droop = 1 - 0.45 * heldDroop;
    // The savor telegraph rides the same pressure: a dip, then a swell,
    // while a springtail is held for the ptooey. Zero when idle.
    const savor = 1 + SAVOR_PULSE_GAIN * savorEnv;
    world.setSlimePressure(
      slime,
      pascals * slime.restVolume * hatchRamp * pulse * breath * droop * savor
    );

    // Stiffness only rewrites its ~1.7k WASM objects when moisture crosses
    // one of six buckets.
    const bucket = Math.round(state.moisture * 5);
    if (bucket !== supplenessBucket) {
      supplenessBucket = bucket;
      world.setSlimeSuppleness(slime, 0.3 + 0.7 * (bucket / 5));
    }
  }

  /** Reconcile which bodies exist with what stage the pet is in. */
  function applyStageScenery(): void {
    const stage = state.stage;
    if (stage === 'sclerotium') {
      removeSlimeBody();
    } else {
      spawnSlimeBody();
    }
    // The emergence: crack, then shatter. Through the blind stretch the
    // crust heaves and its seams pry open (setCracking); then plates break
    // loose centre-out over the next ~54% of the hatch (the body is still
    // low then, so the shatter is in full view) — the shader retires them
    // from the crust while their chips tumble off it — the paper soaks
    // through and fades inside the tail of that, and only once nothing is
    // left to see does the group retire.
    crust.setCracking(stage === 'waking' ? Math.min(1, hatchProgress() / HATCH_REVEAL) : 0);
    const crustGone =
      stage === 'waking' ? Math.min(1, Math.max(0, (hatchProgress() - HATCH_REVEAL) / 0.54)) : 0;
    crust.group.visible = stage === 'sclerotium' || (stage === 'waking' && crustGone < 1);
    crust.setEmergence(crustGone);
    if (stage === 'sclerotium') crustShards.reset();
    else if (!reducedMotion) crustShards.setProgress(crustGone);
    // The skin stays hidden through the blind stretch (see HATCH_REVEAL):
    // what it would show is the spawn orb, not an emergence.
    const bodyHidden =
      stage === 'sclerotium' || (stage === 'waking' && hatchProgress() < HATCH_REVEAL);
    slimeMesh.mesh.visible = !USE_PARTICLES && !bodyHidden;
    surface.mesh.visible = USE_PARTICLES && !bodyHidden;
    // A newborn is small as well as flat: the skin renders scaled down —
    // about the origin, which is where the crust (and so the body) sits
    // during a hatch — and swells to full size as it grows in. Dark, too:
    // the volume clears from packed-pigment murk to sea-glass on the same
    // clock.
    const grow = stage === 'waking' ? growProgress() : 1;
    const spread = 0.55 + 0.45 * grow;
    const tall = 0.5 + 0.5 * grow;
    // The height scale is anchored to the floor, not the origin — a scaled
    // skin must still sit on the moss, so the mesh drops by what the scale
    // would have lifted it.
    const floorAnchor = FLOOR_Y * (1 - tall);
    slimeMesh.mesh.scale.set(spread, tall, spread);
    slimeMesh.mesh.position.y = floorAnchor;
    surface.mesh.scale.set(spread, tall, spread);
    surface.mesh.position.y = floorAnchor;
    // The skin opts out of matrixAutoUpdate (its vertices live in world
    // space), so the newborn scale has to be committed by hand.
    surface.mesh.updateMatrix();
    volume.setNewborn(stage === 'waking' ? 1 - grow : 0);
    eyesPresent = stage === 'active' || (stage === 'waking' && state.revival > 0.85);
    crust.setState(state.moisture, stage === 'sclerotium' ? state.revival : 1);
    volume.setDryness(Math.max(0, 1 - state.moisture * 1.15));
  }

  // Whether the tank is actually in front of someone's eyes right now. The
  // host component drives this from an IntersectionObserver; rendering while
  // scrolled out of view still ticks care, but unwitnessed — so the hatch
  // waits for the tank to scroll back in. Defaults to true for hosts (tests,
  // benches) that never call setWitnessed.
  let witnessed = true;

  function careTick(): void {
    catchUpToNow(state, Date.now(), { witnessed });
    applyStageScenery();
    applyCareToBody();
    saveSlime(state);
    // Rides the same once-a-second tick, on its own slower debounce; the
    // thunk means serialisation only happens on the write that lands.
    saveGrime(() => serializeGrime(grime.field));
  }

  applyStageScenery();
  applyCareToBody();

  // ------------------------------------------------------------ interaction
  const raycaster = new THREE.Raycaster();
  const pointerVec = new THREE.Vector2();
  const gazeScratch = new THREE.Vector2();
  const gazePoint = new THREE.Vector3();
  const pokePoint = new THREE.Vector3();
  const pokeArg = { face: -1, ease: 0 };

  /** The press ray against the slime's current surface, or null off it. */
  function castAtSlime(nx: number, ny: number) {
    const target = USE_PARTICLES ? surface.mesh : slimeMesh.mesh;
    if (!target.visible) return null;
    pointerVec.set(nx, ny);
    raycaster.setFromCamera(pointerVec, camera);
    const hit = raycaster.intersectObject(target, false)[0];
    if (!hit || hit.faceIndex == null) return null;
    // The raycast sees the subdivided skin; the grab cluster lives on the
    // coarse physics mesh it descends from. The particle body has no coarse
    // faces — its hand grabs a point, and the poke look holds a world point.
    return {
      faceIndex: USE_PARTICLES ? hit.faceIndex : slimeMesh.parentFace(hit.faceIndex),
      distance: hit.distance,
      point: hit.point
    };
  }

  function pointerRay(nx: number, ny: number) {
    pointerVec.set(nx, ny);
    raycaster.setFromCamera(pointerVec, camera);
    const { origin, direction } = raycaster.ray;
    return {
      origin: [origin.x, origin.y, origin.z] as [number, number, number],
      dir: [direction.x, direction.y, direction.z] as [number, number, number]
    };
  }

  /**
   * Where in the box a pointer is pointing — the aim for the hand-held
   * tools. The slime's surface if the ray hits it, else the floor under the
   * ray, else a point partway along the ray; whatever wins is clamped into
   * the box, because every tool that aims aims at something in the box.
   */
  function aimPoint(nx: number, ny: number): [number, number, number] {
    const margin = 0.01;
    const hit = castAtSlime(nx, ny);
    const ray = pointerRay(nx, ny);
    let x: number;
    let y: number;
    let z: number;
    if (hit) {
      x = ray.origin[0] + ray.dir[0] * hit.distance;
      y = ray.origin[1] + ray.dir[1] * hit.distance;
      z = ray.origin[2] + ray.dir[2] * hit.distance;
    } else if (ray.dir[1] < -1e-6) {
      const t = (FLOOR_Y - ray.origin[1]) / ray.dir[1];
      x = ray.origin[0] + ray.dir[0] * t;
      y = FLOOR_Y + 0.004;
      z = ray.origin[2] + ray.dir[2] * t;
    } else {
      // Aimed at the room: take the ray where it passes the box and let the
      // clamp pull it inside.
      x = ray.origin[0] + ray.dir[0] * CAMERA_DISTANCE;
      y = ray.origin[1] + ray.dir[1] * CAMERA_DISTANCE;
      z = ray.origin[2] + ray.dir[2] * CAMERA_DISTANCE;
    }
    return [
      THREE.MathUtils.clamp(x, -BOX_HALF_X + margin, BOX_HALF_X - margin),
      THREE.MathUtils.clamp(y, FLOOR_Y + 0.004, FLOOR_Y + BOX_HEIGHT - margin),
      THREE.MathUtils.clamp(z, -BOX_HALF_Z + margin, BOX_HALF_Z - margin)
    ];
  }

  // ------------------------------------------------------------- the clock
  let simAccumulator = 0;
  let lastFrameMs: number | null = null;

  let fpsAccumSec = 0;
  let fpsFrames = 0;
  let displayFps = 0;

  // ----------------------------------------------------------------- pointer
  let orbiting = false;
  let lastPointer: [number, number] = [0, 0];
  let tool: SlimeTool = 'hand';
  /** A squeegee stroke is in progress (pressed on glass, not yet released). */
  let squeegeeStroke = false;
  /**
   * Petting: pointer travel (NDC) banked while the pet gesture is held, and
   * drained by the render loop into the emotion meter at a capped rate — so
   * affection accrues with the *stroking*, not the pressing, and scrubbing
   * madly pays no faster than a steady caress.
   */
  let petTravel = 0;
  /** The being-petted face: eases toward 1 while the stroke is on the body,
   * relaxes after — so the squint blooms and fades rather than snapping. */
  let petSquint = 0;

  // A touch on the body draws the eyes to it — but not always the first one.
  // Each bout of poking rolls, from the pet's own seed, how many pokes it
  // takes to notice: one, two or three. Once it notices, the eyes cross
  // toward the poked spot the way anyone looks at a finger on their own
  // nose, hold there a moment, and drift back to the room.
  const pokeRand = mulberry32((seed ^ 0x90ce) >>> 0);
  let pokeFace = -1;
  /** Where the poke landed in the world — the particle body's "nose". */
  const pokeWorld = new THREE.Vector3();
  let pokeLookSec = 0;
  let pokeBoutSec = 0;
  let pokesSeen = 0;
  let pokesToNotice = 0;
  let pokeLookEase = 0;

  function snapshot(): SlimeSnapshot {
    let grimeWorst = 0;
    for (let pane = 0; pane < PANE_COUNT; pane++) {
      grimeWorst = Math.max(grimeWorst, grime.mean(pane));
    }
    return {
      state: { ...state },
      displayFps,
      grabbing: handState() === 'grabbing',
      canFeed: canFeed(state) && !flake,
      feeding: !!flake,
      moldy: !!flake && flake.engulfing === null && flake.age >= OAT_MOLD_SEC,
      grimeWorst,
      canSparkle: canSparkle(state),
      roaming,
      ballOut
    };
  }

  return {
    renderer,

    resize() {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },

    render(timeMs) {
      const frameSec = lastFrameMs === null ? 0 : (timeMs - lastFrameMs) / 1000;
      lastFrameMs = timeMs;

      if (frameSec > 0 && frameSec < FPS_DISCONTINUITY_SEC) {
        fpsAccumSec += frameSec;
        fpsFrames += 1;
        if (fpsAccumSec >= FPS_WINDOW_SEC) {
          displayFps = fpsFrames / fpsAccumSec;
          fpsAccumSec = 0;
          fpsFrames = 0;
        }
      }

      // The care clock: a one-second tick through the same catch-up path a
      // returning visitor takes.
      careAccumulator += frameSec;
      if (careAccumulator >= CARE_TICK_SEC) {
        careAccumulator = 0;
        careTick();
      }

      // The spray pulse, the hatch ramp and the idle breath all move faster
      // than the care tick, so pressure is refreshed per frame while any of
      // them is live. Under reduced motion none of them are, the tick's
      // value stands, and the body is free to sleep.
      if (mistInFlightSec > 0) {
        mistInFlightSec -= frameSec;
        if (mistInFlightSec <= 0) mistLands();
      }
      if (sprayPulse > 0) sprayPulse = Math.max(0, sprayPulse - frameSec);
      if (state.stage === 'waking') applyStageScenery();
      breathPhase += frameSec;
      sceneSec += frameSec;

      // The mood, every frame: being carried is continuously stimulating,
      // and the meter itself relaxes toward the care state's baseline.
      if (handState() === 'grabbing') emotionMeter.excite(frameSec * 0.6);
      // Petting pays out as the stroke travels: the banked pointer distance
      // drains at a capped rate into a big valence lift and only a whisper
      // of arousal — being stroked is soothing, being carried is thrilling.
      if (handState() === 'petting' && petTravel > 0) {
        const spent = Math.min(petTravel, frameSec * 0.6);
        petTravel -= spent;
        emotionMeter.excite(spent * 0.15, spent * 0.4);
      }
      // The squint blooms in over a beat of stroking and melts away after —
      // slower out than in, so the contented face lingers past the touch.
      const squintTarget = handState() === 'petting' ? 1 : 0;
      const squintTau = squintTarget > petSquint ? 0.35 : 0.9;
      petSquint += (squintTarget - petSquint) * Math.min(1, frameSec / squintTau);
      mood = emotionMeter.update(frameSec, state);
      volume.setEmotion(mood.valence, mood.arousal);

      // Droop eases in while dangling, and recovers on touch-down — quickly,
      // because plumping back up is half of what makes the sag read.
      const dangling = handState() === 'grabbing' && lastFloorContacts === 0;
      const droopTarget = dangling ? 1 : 0;
      heldDroop += (droopTarget - heldDroop) * Math.min(1, frameSec / 0.3);

      const pressureLive =
        sprayPulse > 0 ||
        state.stage === 'waking' ||
        heldDroop > 0.01 ||
        heldIdx >= 0 ||
        (state.stage === 'active' && !reducedMotion);
      if (pressureLive) applyCareToBody();

      // The will's appetite, refreshed once per frame. Only actually eating
      // holds it still; a flake merely *lying there* is the opposite of a
      // reason to freeze — it is the errand.
      const eating = !!flake && flake.engulfing !== null;
      climbInputs.handBusy = handState() !== 'idle';
      climbInputs.zest = state.stage === 'active' && !eating ? Math.max(0.2, state.vigor) : 0;
      climbInputs.moisture = state.moisture;
      climbInputs.speed = motionScale;
      // The lure: a landed, still-good flake, offered only while genuinely
      // hungry. A full slime is enticed by nothing, and mold entices no one.
      // The lure survives into the engulf: the flake is eaten where it lies,
      // so the body must stay parked on top of it until the meal is done.
      if (
        flake &&
        (flake.engulfing !== null ||
          (flake.age > 0.5 && flake.age < OAT_MOLD_SEC && canFeed(state)))
      ) {
        foodScratch[0] = flakePose[0];
        foodScratch[1] = flakePose[1];
        foodScratch[2] = flakePose[2];
        climbInputs.food = foodScratch;
      } else {
        climbInputs.food = null;
      }
      // The continuum will: the corral leans toward the meal and the mound
      // crawls there — faster when excited, listlessly when low. The hand
      // outranks it, same as the climb. With no meal out, an aroused and
      // content slime sometimes ambles to a spot of its own choosing.
      if (particles) {
        const willFree = !climbInputs.handBusy && state.stage === 'active';
        attentionWant = 0;
        if (climbInputs.food && willFree) {
          ambleUntil = 0;
          // While actually eating the lure softens to a hold: enough to keep
          // the mound draped over the flake, not enough to churn.
          particles.setLure(
            foodScratch[0],
            foodScratch[2],
            (eating ? 0.35 : 0.7 + 0.7 * mood.arousal) * motionScale
          );
          attentionWorld.set(foodScratch[0], foodScratch[1], foodScratch[2]);
          attentionWant = 1;
          roaming = true;
        } else if (willFree && ballOut && ballPrevValid && sceneSec < playUntil) {
          // Playtime: chase the ball where it actually is. The nose-push
          // that follows is pure physics — the corral crawls the body onto
          // the toy, the toy gets batted away, the chase resumes.
          ambleUntil = 0;
          particles.setLure(ballPrev[0], ballPrev[2], (0.6 + 0.9 * mood.arousal) * motionScale);
          attentionWorld.set(ballPrev[0], ballPrev[1], ballPrev[2]);
          attentionWant = 1;
          roaming = true;
        } else if (willFree && sceneSec < chaseUntil) {
          // Chasing springtails: the lure tracks the quarry, so every
          // furcula ping yanks the chase to wherever it landed.
          const quarry = springtails.positionOf(chaseIdx);
          if (heldIdx >= 0) {
            // Mouth full: the slime sits with its prize, going nowhere.
            particles.clearLure();
            roaming = false;
          } else if (springtails.flightPositionOf(chaseIdx)) {
            // The quarry is still mid-ptooey: the slime sits and watches
            // its own throw come down — the chase resumes at touchdown,
            // not under it. (The eyes are already tracking the arc.)
            particles.clearLure();
            roaming = false;
          } else if (quarry) {
            ambleUntil = 0;
            particles.setLure(quarry[0], quarry[1], (0.5 + 0.8 * mood.arousal) * motionScale);
            attentionWorld.set(quarry[0], FLOOR_Y + 0.002, quarry[1]);
            attentionWant = 1;
            roaming = true;
          } else {
            // The quarry is gone (a hunger flip mid-game turns tag into
            // dinner): pick whoever is nearest, or let the bout lapse.
            chaseIdx = springtails.nearestLive(slimeCenter[0], slimeCenter[2]);
            if (chaseIdx < 0) chaseUntil = 0;
            particles.clearLure();
            roaming = false;
          }
        } else if (willFree && sceneSec < perchUntil && perchRock >= 0) {
          // Climbing a rock: the lure parks on its footprint and the
          // solver's grip-haul does the ascent. Once the body is up, the
          // lure softens to a hold — enough to keep it perched, not enough
          // to churn — the same idiom as eating's drape over the flake.
          const rock = terrarium.rocks[perchRock];
          const up =
            Math.hypot(slimeCenter[0] - rock.x, slimeCenter[2] - rock.z) < rock.radius * 0.7;
          particles.setLure(rock.x, rock.z, (up ? 0.35 : 0.6 + 0.5 * mood.arousal) * motionScale);
          // Eyes on the summit during the climb; once perched, the view is
          // the point — the gaze frees back to the room.
          if (!up) {
            attentionWorld.set(rock.x, rock.y + rock.radius * 0.6, rock.z);
            attentionWant = 0.7;
          }
          roaming = true;
        } else if (willFree && sceneSec < ambleUntil) {
          particles.setLure(
            ambleTarget[0],
            ambleTarget[1],
            (0.4 + 0.6 * mood.arousal) * motionScale
          );
          // An ambling slime half-watches where it's going.
          attentionWorld.set(ambleTarget[0], FLOOR_Y + 0.002, ambleTarget[1]);
          attentionWant = 0.35;
          roaming = true;
        } else {
          if (sceneSec >= ambleUntil) ambleUntil = 0;
          particles.clearLure();
          roaming = false;
        }
        // The amble scheduler: a dispirited or sleepy slime stays put; an
        // excited one trips more often. Interruptions (food, the hand)
        // simply preempt the lure above — the errand quietly lapses.
        if (willFree && !climbInputs.food && ambleUntil === 0 && sceneSec >= nextAmbleAt) {
          if (mood.valence > 0.3 && mood.arousal > 0.2) {
            const reach = 0.75;
            ambleTarget[0] = (emotionRand() * 2 - 1) * BOX_HALF_X * reach;
            ambleTarget[1] = (emotionRand() * 2 - 1) * BOX_HALF_Z * reach;
            ambleUntil = sceneSec + 4 + emotionRand() * 5;
            nextAmbleAt = ambleUntil + (12 + emotionRand() * 30) / (0.4 + mood.arousal);
          } else {
            nextAmbleAt = sceneSec + 10;
          }
        }
        // The popcorn scheduler. Bursts only fire out of real excitement —
        // high arousal on a content baseline — so they cluster right after
        // play, a treat, a spray: the moments a mouse would popcorn too.
        // The solver's own grounded gate makes each hop honest; anything
        // that lifts the body mid-burst simply eats the remaining hops.
        if (!reducedMotion && willFree && !eating) {
          if (popcornHopsLeft > 0 && sceneSec >= nextPopHopAt) {
            popcornHopsLeft -= 1;
            const ang = emotionRand() * Math.PI * 2;
            const drift = 0.03 * emotionRand();
            particles.hop(
              (0.5 + 0.2 * mood.arousal) * motionScale,
              Math.cos(ang) * drift,
              Math.sin(ang) * drift
            );
            nextPopHopAt = sceneSec + 0.35 + emotionRand() * 0.3;
          }
          if (popcornHopsLeft === 0 && sceneSec >= nextPopcornAt) {
            if (mood.arousal > 0.55 && mood.valence > 0.45) {
              popcornHopsLeft = 2 + Math.floor(emotionRand() * 3);
              nextPopHopAt = sceneSec;
              nextPopcornAt = sceneSec + 18 + emotionRand() * 40;
            } else {
              nextPopcornAt = sceneSec + 5;
            }
          }
        } else {
          popcornHopsLeft = 0;
        }
        // The play scheduler: with the ball out, a content-enough slime
        // takes it in bouts — chase for a stretch, rest, come back to it.
        // A miserable or torpid pet leaves the toy where it lies.
        if (willFree && ballOut && !climbInputs.food && playUntil <= sceneSec) {
          if (sceneSec >= nextPlayAt) {
            if (mood.valence > 0.2 && mood.arousal > 0.1) {
              playUntil = sceneSec + 6 + emotionRand() * 8;
              nextPlayAt = playUntil + (8 + emotionRand() * 17) / (0.4 + mood.arousal);
            } else {
              nextPlayAt = sceneSec + 8;
            }
          }
        }
        // The perch scheduler: damp enough to grip (the old glass-climb's
        // moisture gate), content enough to wander — sometimes the trip is
        // *up*. Dries the same way it always did: a crusting pet never has
        // the moisture, so the gate answers the lifecycle for free.
        if (
          willFree &&
          !climbInputs.food &&
          perchUntil <= sceneSec &&
          sceneSec >= nextPerchAt &&
          terrarium.rocks.length > 0
        ) {
          if (state.moisture >= 0.35 && mood.valence > 0.2 && mood.arousal > 0.1) {
            perchRock = Math.floor(emotionRand() * terrarium.rocks.length);
            perchUntil = sceneSec + 12 + emotionRand() * 15;
            nextPerchAt = perchUntil + (40 + emotionRand() * 80) / (0.4 + mood.arousal);
          } else {
            nextPerchAt = sceneSec + 15;
          }
        }
        // The chase scheduler: no toy out, nothing to eat, a bright mood
        // on a full belly — sometimes the crew itself is the game. A
        // hungry slime never "plays" this; that would be hunting.
        if (willFree && !ballOut && !climbInputs.food && chaseUntil <= sceneSec) {
          if (sceneSec >= nextChaseAt) {
            if (mood.valence > 0.25 && mood.arousal > 0.2 && !canFeed(state)) {
              chaseIdx = springtails.nearestLive(slimeCenter[0], slimeCenter[2]);
              if (chaseIdx >= 0) {
                chaseUntil = sceneSec + 5 + emotionRand() * 7;
                nextChaseAt = chaseUntil + (25 + emotionRand() * 50) / (0.4 + mood.arousal);
              } else {
                nextChaseAt = sceneSec + 15;
              }
            } else {
              nextChaseAt = sceneSec + 10;
            }
          }
        }
      }

      // Fixed-step physics behind an accumulator. The scene owns the step —
      // `world.step` just takes dt — and the substep cap turns a long stall
      // into slow motion rather than a spiral of catch-up work. The cap must
      // be SMALL for that to be true: a particle substep costs ~2.7 ms, so a
      // generous cap is itself the stall — one compositor hiccup banks a
      // backlog, the catch-up frame runs tens of milliseconds of physics,
      // misses its own deadline, and the stutter feeds itself (profiled:
      // 90–100 ms frames, worst at soft tunings that run the solver hot).
      // Backlog beyond the cap is dropped, not banked — the care clock keeps
      // its own time, so dropped sim time is purely cosmetic.
      // The crew's senses, computed once per frame from last frame's
      // readback — frame-stable inputs, fed to every physics substep.
      const springtailMoldAt =
        flake && flake.engulfing === null && flake.age >= OAT_MOLD_SEC ? flakePose : null;
      const springtailBodyRadius = state.radiusMm / 1000;
      const springtailGrounded = slimeCenter[1] < FLOOR_Y + springtailBodyRadius * 1.2;
      // The footprint goes in hungry-lethal, or playful while a chase
      // bout is on — same startle, same pings, nobody eaten.
      const springtailPredator =
        springtailGrounded && (canFeed(state) || sceneSec < chaseUntil)
          ? {
              x: slimeCenter[0],
              z: slimeCenter[2],
              radius: springtailBodyRadius,
              playful: !canFeed(state)
            }
          : null;

      simAccumulator = Math.min(simAccumulator + frameSec, MAX_SIM_SUBSTEPS * SIM_STEP_SEC);
      let substeps = 0;
      while (simAccumulator >= SIM_STEP_SEC && substeps < MAX_SIM_SUBSTEPS) {
        // The hand first, then the will, then the world: every steering
        // velocity has to be in place for the step it steers, and the hand
        // outranks the will (the will yields the moment the hand is busy).
        // The particle body is absent on purpose — it and its hand step on
        // the worker's own clock; this loop is the Jolt world's (stones,
        // squeegee, the springtail crew, the legacy soft-body path).
        if (!USE_PARTICLES) interaction?.step(SIM_STEP_SEC);
        if (climb) roaming = climb.step(SIM_STEP_SEC, climbInputs).active;
        squeegee.step(SIM_STEP_SEC);
        springtails.stepPhysics(SIM_STEP_SEC, springtailMoldAt, springtailPredator);
        world.step(SIM_STEP_SEC);
        simAccumulator -= SIM_STEP_SEC;
        substeps += 1;
      }

      if (particles) {
        particles.readPositions(particlePositions);
        const particleCount = particles.particleCount;

        // Watchdog, continuum edition. The material cannot shred, but while
        // its tuning is live the one failure it has shown is numeric — a
        // non-finite excursion under an extreme transient. One bad centroid
        // → fresh world at rest, care state untouched, same doctrine as the
        // mesh watchdog.
        slimeCenter[0] = slimeCenter[1] = slimeCenter[2] = 0;
        for (let i = 0; i < particleCount; i++) {
          slimeCenter[0] += particlePositions[i * 3];
          slimeCenter[1] += particlePositions[i * 3 + 1];
          slimeCenter[2] += particlePositions[i * 3 + 2];
        }
        slimeCenter[0] /= particleCount;
        slimeCenter[1] /= particleCount;
        slimeCenter[2] /= particleCount;
        if (!Number.isFinite(slimeCenter[0] + slimeCenter[1] + slimeCenter[2])) {
          console.warn('[slime] continuum body went non-finite — watchdog rebuilt it at rest');
          removeSlimeBody();
          spawnSlimeBody();
          particles!.readPositions(particlePositions);
          slimeCenter[0] = slimeCenter[2] = 0;
          slimeCenter[1] = FLOOR_Y + 0.01;
        }

        // The emotional ripple: an aroused body's skin travels a visible
        // wave; a calm one sits still. Absent under reduced motion, where
        // the pet keeps its feelings to its eyes and its colour.
        wavePhase += frameSec * (1.5 + 5 * mood.arousal);
        // A mouthful adds a shimmer of its own — the held breath shows
        // on the skin as well as in the pressure.
        const savorAmp = heldIdx >= 0 ? 0.0006 : 0;
        const waveAmp = reducedMotion
          ? 0
          : 0.0011 * Math.max(0, mood.arousal - 0.15) + savorAmp;
        surface.update(
          particlePositions,
          particleCount,
          waveAmp > 0 ? { amp: waveAmp, phase: wavePhase } : undefined
        );

        // The mica swirl: agitation = mean speed of a strided sample of
        // particles, smoothed; the swirl phase runs on it. Poke the body and
        // the flakes churn; leave it be and they settle to an idle drift.
        if (micaStrength > 0 && frameSec > 0) {
          const samples = Math.min(48, particleCount);
          const step = Math.max(1, Math.floor(particleCount / samples));
          if (!micaPrev || micaPrev.length !== samples * 3) {
            micaPrev = new Float32Array(samples * 3);
            for (let k = 0; k < samples; k++) {
              const j = k * step * 3;
              micaPrev[k * 3] = particlePositions[j];
              micaPrev[k * 3 + 1] = particlePositions[j + 1];
              micaPrev[k * 3 + 2] = particlePositions[j + 2];
            }
          } else {
            let sum = 0;
            for (let k = 0; k < samples; k++) {
              const j = k * step * 3;
              const o = k * 3;
              sum +=
                Math.abs(particlePositions[j] - micaPrev[o]) +
                Math.abs(particlePositions[j + 1] - micaPrev[o + 1]) +
                Math.abs(particlePositions[j + 2] - micaPrev[o + 2]);
              micaPrev[o] = particlePositions[j];
              micaPrev[o + 1] = particlePositions[j + 1];
              micaPrev[o + 2] = particlePositions[j + 2];
            }
            const meanSpeed = sum / samples / frameSec;
            const target = Math.min(1, meanSpeed * 8);
            micaAgitation += (target - micaAgitation) * Math.min(1, frameSec * 2.5);
          }
          swirlPhase += frameSec * (SWIRL_BASE + SWIRL_STIR * micaAgitation);
          volume.setSwirl(slimeCenter, swirlPhase);
        }

        // The eyes' glance target — same as the mesh path.
        gazeScratch.set(lastPointer[0], lastPointer[1]);
        raycaster.setFromCamera(gazeScratch, camera);
        raycaster.ray.at(0.14, gazePoint);

        // The will's errand draws the gaze off the room: eyes on the meal,
        // the ball, the quarry, the summit. Eased both ways, so attention
        // drifts on and lets go rather than snapping.
        attentionEase += (attentionWant - attentionEase) * Math.min(1, frameSec / ATTENTION_EASE_SEC);
        if (attentionEase > 0.001) gazePoint.lerp(attentionWorld, Math.min(1, attentionEase));

        // The flying critter steals the gaze — but the hand still
        // outranks the show, so the poke lerp lands after this one.
        if (spitLookEase > 0.001) gazePoint.lerp(spitWorld, spitLookEase);

        pokeBoutSec = Math.max(0, pokeBoutSec - frameSec);
        if (handState() === 'grabbing') pokeLookSec = 0;
        else pokeLookSec = Math.max(0, pokeLookSec - frameSec);
        const wantPokeLook = pokeLookSec > 0 && pokeFace >= 0 ? 1 : 0;
        pokeLookEase += (wantPokeLook - pokeLookEase) * Math.min(1, frameSec / POKE_LOOK_EASE_SEC);
        if (pokeLookEase > 0.001) {
          gazePoint.lerp(pokeWorld, pokeLookEase);
          particlePokeArg.point[0] = pokeWorld.x;
          particlePokeArg.point[1] = pokeWorld.y;
          particlePokeArg.point[2] = pokeWorld.z;
          particlePokeArg.ease = pokeLookEase;
        }
        // No eyes until there's a slime to put them in: while the stage
        // doesn't want them the pair stays unformed, and the first frame it
        // does they condense low in the body and float up to their perch.
        if (eyesPresent)
          particleEyes.update(
            particlePositions,
            particleCount,
            timeMs / 1000,
            [gazePoint.x, gazePoint.y, gazePoint.z],
            mood,
            pokeLookEase > 0.001 ? particlePokeArg : null,
            petSquint
          );
        else particleEyes.conceal();

        // Trails and grime, from the particles themselves — every second
        // particle, which at this count is plenty of splats.
        let contacts = 0;
        for (let i = 0; i < particleCount; i += 2) {
          if (particlePositions[i * 3 + 1] > FLOOR_Y + TRAIL_CONTACT_HEIGHT) continue;
          particleContactScratch[contacts * 2] = particlePositions[i * 3];
          particleContactScratch[contacts * 2 + 1] = particlePositions[i * 3 + 2];
          contacts += 1;
        }
        lastFloorContacts = contacts;
        trails.update(frameSec, particleContactScratch, contacts, motionScale);

        let grimeContacts = 0;
        const invFrame = frameSec > 1e-6 ? 1 / frameSec : 0;
        for (let i = 0; i < particleCount; i += 2) {
          const x = particlePositions[i * 3];
          const y = particlePositions[i * 3 + 1];
          const z = particlePositions[i * 3 + 2];
          for (let pane = 0; pane < PANE_COUNT; pane++) {
            if (paneDistance(pane, x, y, z) > GRIME_CONTACT_DIST) continue;
            const [u, v] = paneUv(pane, x, y, z);
            if (u < 0 || u > 1 || v < 0 || v > 1) continue;
            let slide = 0;
            if (particlePrevValid) {
              const dx = x - particlePrev[i * 3];
              const dy = y - particlePrev[i * 3 + 1];
              const dz = z - particlePrev[i * 3 + 2];
              slide = Math.min(0.5, Math.hypot(dx, dy, dz) * invFrame);
            }
            particleGrimeScratch[grimeContacts * 4] = pane;
            particleGrimeScratch[grimeContacts * 4 + 1] = u;
            particleGrimeScratch[grimeContacts * 4 + 2] = v;
            particleGrimeScratch[grimeContacts * 4 + 3] = slide;
            grimeContacts += 1;
          }
        }
        grime.update(frameSec, particleGrimeScratch, grimeContacts, motionScale, grimeDampScale());
        particlePrev.set(particlePositions);
        particlePrevValid = true;
      } else if (slime) {
        world.readSlimeVertices(slime, vertexScratch);

        watchdogCooldownSec = Math.max(0, watchdogCooldownSec - frameSec);
        if (watchdogCooldownSec <= 0 && slimeLooksShredded()) {
          // Loud on purpose: to the visitor this is a one-frame blip, but to
          // whoever is tuning the solver it is the crash report.
          console.warn('[slime] soft body shredded — watchdog rebuilt it at rest');
          removeSlimeBody();
          spawnSlimeBody();
          world.readSlimeVertices(slime!, vertexScratch);
          watchdogCooldownSec = 1;
        }

        slimeMesh.update(vertexScratch);

        slimeCenter[0] = slimeCenter[1] = slimeCenter[2] = 0;
        for (let i = 0; i < egg.vertexCount; i++) {
          slimeCenter[0] += vertexScratch[i * 3];
          slimeCenter[1] += vertexScratch[i * 3 + 1];
          slimeCenter[2] += vertexScratch[i * 3 + 2];
        }
        slimeCenter[0] /= egg.vertexCount;
        slimeCenter[1] /= egg.vertexCount;
        slimeCenter[2] /= egg.vertexCount;

        // The eyes glance at the pointer's last known spot in the box; the
        // trail collects wherever the underside is touching the substrate.
        gazeScratch.set(lastPointer[0], lastPointer[1]);
        raycaster.setFromCamera(gazeScratch, camera);
        raycaster.ray.at(0.14, gazePoint);

        // The poke look: its clock runs down, a grab cancels it outright (a
        // carried slime has bigger concerns), and the ease keeps onset and
        // return soft — the same ease drives the eyes' swim to the spot and
        // their cross-eyed convergence on it. The looked-at point is the
        // poked face's centroid read fresh from this frame's vertices, so
        // the "nose" rides every jiggle the body makes.
        // The flying critter steals the gaze; the poke lerp below still
        // outranks it, hand-over-show as everywhere else.
        if (spitLookEase > 0.001) gazePoint.lerp(spitWorld, spitLookEase);

        pokeBoutSec = Math.max(0, pokeBoutSec - frameSec);
        if (interaction?.state() === 'grabbing') pokeLookSec = 0;
        else pokeLookSec = Math.max(0, pokeLookSec - frameSec);
        const wantPokeLook = pokeLookSec > 0 && pokeFace >= 0 ? 1 : 0;
        pokeLookEase += (wantPokeLook - pokeLookEase) * Math.min(1, frameSec / POKE_LOOK_EASE_SEC);
        if (pokeLookEase > 0.001 && pokeFace >= 0) {
          pokePoint.set(0, 0, 0);
          for (let corner = 0; corner < 3; corner++) {
            const v = egg.faces[pokeFace * 3 + corner];
            pokePoint.x += vertexScratch[v * 3] / 3;
            pokePoint.y += vertexScratch[v * 3 + 1] / 3;
            pokePoint.z += vertexScratch[v * 3 + 2] / 3;
          }
          gazePoint.lerp(pokePoint, pokeLookEase);
          pokeArg.face = pokeFace;
          pokeArg.ease = pokeLookEase;
        }
        eyes.update(
          vertexScratch,
          timeMs / 1000,
          [gazePoint.x, gazePoint.y, gazePoint.z],
          moodOf(state),
          pokeLookEase > 0.001 && pokeFace >= 0 ? pokeArg : null
        );

        let contacts = 0;
        for (let i = 0; i < egg.vertexCount; i++) {
          if (egg.regions[i] !== REGION_BOTTOM) continue;
          if (vertexScratch[i * 3 + 1] > FLOOR_Y + TRAIL_CONTACT_HEIGHT) continue;
          contactScratch[contacts * 2] = vertexScratch[i * 3];
          contactScratch[contacts * 2 + 1] = vertexScratch[i * 3 + 2];
          contacts += 1;
        }
        lastFloorContacts = contacts;
        trails.update(frameSec, contactScratch, contacts, motionScale);

        // Grime: any vertex pressed against a pane smudges it, harder when
        // sliding — a climb is a long smear, a rest against the glass a
        // slow fog. Slide speed comes from last frame's positions.
        let grimeContacts = 0;
        const invFrame = frameSec > 1e-6 ? 1 / frameSec : 0;
        for (let i = 0; i < egg.vertexCount; i++) {
          const x = vertexScratch[i * 3];
          const y = vertexScratch[i * 3 + 1];
          const z = vertexScratch[i * 3 + 2];
          for (let pane = 0; pane < PANE_COUNT; pane++) {
            if (paneDistance(pane, x, y, z) > GRIME_CONTACT_DIST) continue;
            const [u, v] = paneUv(pane, x, y, z);
            if (u < 0 || u > 1 || v < 0 || v > 1) continue;
            let slide = 0;
            if (prevVertexValid) {
              const dx = x - prevVertexScratch[i * 3];
              const dy = y - prevVertexScratch[i * 3 + 1];
              const dz = z - prevVertexScratch[i * 3 + 2];
              slide = Math.min(0.5, Math.hypot(dx, dy, dz) * invFrame);
            }
            grimeContactScratch[grimeContacts * 4] = pane;
            grimeContactScratch[grimeContacts * 4 + 1] = u;
            grimeContactScratch[grimeContacts * 4 + 2] = v;
            grimeContactScratch[grimeContacts * 4 + 3] = slide;
            grimeContacts += 1;
          }
        }
        grime.update(frameSec, grimeContactScratch, grimeContacts, motionScale, grimeDampScale());
        prevVertexScratch.set(vertexScratch);
        prevVertexValid = true;
      } else {
        trails.update(frameSec, contactScratch, 0, motionScale);
        grime.update(frameSec, grimeContactScratch, 0, motionScale, grimeDampScale());
        prevVertexValid = false;
      }

      // Night watch: every half minute, ask the clock whether the lamp
      // should be off, and repaint the room when the answer changes.
      nightCheckSec += frameSec;
      if (nightCheckSec >= 30) {
        nightCheckSec = 0;
        const night = isNightAt(new Date().getHours());
        if (night !== nightNow) {
          nightNow = night;
          applyLightingNow();
        }
      }

      // The cleanup crew: dart-and-pause across the moss, converge on a
      // moldy flake, and — given long enough — clear it themselves. They
      // are also, to a hungry slime, food: while the pet is awake, wants
      // feeding, and is down on the moss, its footprint is a predator and
      // any critter that touches it is a snack. Same hunger gate as the
      // flake — a full slime lets the crew walk right under it.
      {
        // The physics half already ran inside the sim loop; this is the
        // look-and-events half, on the frame's clock.
        const moldAt = springtailMoldAt;
        const bodyRadius = springtailBodyRadius;
        const grounded = springtailGrounded;
        const crew = springtails.update(frameSec);
        // The slurp-and-ptooey. Corner the quarry mid-chase and it gets
        // sucked in; a savoring beat later it is spat back out in an arc.
        // Losing the ground (or the mood ending the bout) spits early —
        // a critter is never left swallowed.
        if (heldIdx >= 0) {
          if (sceneSec >= heldUntil || sceneSec >= chaseUntil || !grounded) {
            springtails.eject(heldIdx, slimeCenter[0], slimeCenter[2]);
            // Ptooey! The spit is the punchline of the whole game —
            // and the eyes follow their own handiwork. The bout stays
            // open long enough to watch the landing and give chase.
            spitWatchIdx = heldIdx;
            chaseUntil = Math.max(chaseUntil, sceneSec + 3);
            emotionMeter.excite(0.35, 0.15);
            heldIdx = -1;
          }
        } else if (sceneSec < chaseUntil && grounded && !canFeed(state)) {
          const q = springtails.positionOf(chaseIdx);
          if (q && Math.hypot(q[0] - slimeCenter[0], q[1] - slimeCenter[2]) < bodyRadius * 0.5) {
            if (springtails.capture(chaseIdx)) {
              heldIdx = chaseIdx;
              heldDur = 0.8 + emotionRand() * 0.9;
              heldUntil = sceneSec + heldDur;
              // The bout stretches to cover the savor and the spit.
              chaseUntil = Math.max(chaseUntil, heldUntil + 1.5);
              emotionMeter.excite(0.2, 0.1);
            }
          }
        }
        // The telegraph: while savoring, the body squashes then swells
        // like a held breath — the eye arrives before the ptooey does.
        // Sent to the solver only while the envelope runs, with a single
        // restoring call when it ends; idle frames send nothing.
        if (heldIdx >= 0 && !reducedMotion && state.stage === 'active') {
          const t = Math.min(1, Math.max(0, 1 - (heldUntil - sceneSec) / heldDur));
          // A dip first, then the swell: sin crosses zero a third in.
          savorEnv = Math.sin(Math.PI * (t * 1.5 - 0.25));
          if (particles) {
            particles.setTuning(
              tuningViscosity,
              tuningPressure * (1 + SAVOR_PULSE_GAIN * savorEnv * motionScale),
              tuningShape
            );
            telegraphActive = true;
          }
        } else if (savorEnv !== 0 || telegraphActive) {
          savorEnv = 0;
          if (telegraphActive) {
            telegraphActive = false;
            particles?.setTuning(tuningViscosity, tuningPressure, tuningShape);
          }
        }
        // The eyes' spit-watch target: eased in at launch, lingering on
        // the landing spot for a beat after touchdown.
        const flightPos =
          spitWatchIdx >= 0 ? springtails.flightPositionOf(spitWatchIdx) : null;
        if (flightPos) spitWorld.set(flightPos[0], flightPos[1], flightPos[2]);
        const wantSpitLook = flightPos ? 1 : 0;
        spitLookEase += (wantSpitLook - spitLookEase) * Math.min(1, frameSec / SPIT_LOOK_EASE_SEC);
        if (!flightPos && spitLookEase < 0.01) spitWatchIdx = -1;
        // Tagging a critter mid-chase is the game's little payoff: the
        // ping right underfoot lands like batting the ball.
        chaseThrillCooldownSec = Math.max(0, chaseThrillCooldownSec - frameSec);
        if (crew.pinged > 0 && sceneSec < chaseUntil && chaseThrillCooldownSec <= 0) {
          emotionMeter.excite(0.25, 0.12);
          chaseThrillCooldownSec = 1.5;
        }
        // The crew's progress shows: the moldy flake is nibbled smaller
        // as they work, so the chore visibly answers itself.
        if (moldAt && flake) {
          const nibbled = 1 - crew.feedProgress * 0.75;
          flake.mesh.scale.set(nibbled, nibbled, nibbled);
        }
        if (crew.moldCleared) removeFlake();
        // Touchdown dust: a spat critter hitting the moss kicks up a puff.
        if (crew.landings && !reducedMotion) {
          for (const [lx, lz] of crew.landings) {
            dustFx.puff(lx, lz, FLOOR_Y + terrarium.groundHeightAt(lx, lz));
          }
        }
        if (crew.eaten > 0) {
          for (let i = 0; i < crew.eaten; i++) applySnack(state, Date.now());
          // A caught critter is a small thrill, not the day's big event.
          emotionMeter.excite(0.2, 0.15);
          applyCareToBody();
          // Like a meal, a snack is written through — closing the tab a
          // moment later cannot un-eat it.
          flushSlime(state);
        }
      }

      // The play ball: pose from the worker's snapshots, and the nudge
      // detector — the ball suddenly scooting while the body is right on it
      // is the slime batting its toy, and that is the point of the toy.
      if (ballOut) {
        // A pet that curls up into a crust has its toy tidied away.
        if (state.stage === 'sclerotium') {
          putBallAway();
        } else {
          const pose = solver.ballPose();
          if (pose) {
            ballMesh.mesh.visible = true;
            ballMesh.mesh.position.set(pose[0], pose[1], pose[2]);
            ballMesh.mesh.quaternion.set(pose[3], pose[4], pose[5], pose[6]);
            nudgeCooldownSec = Math.max(0, nudgeCooldownSec - frameSec);
            if (ballPrevValid && frameSec > 1e-6) {
              const speed =
                Math.hypot(
                  pose[0] - ballPrev[0],
                  pose[1] - ballPrev[1],
                  pose[2] - ballPrev[2]
                ) / frameSec;
              const nearBody =
                Math.hypot(pose[0] - slimeCenter[0], pose[2] - slimeCenter[2]) < 0.032;
              if (speed > NUDGE_SPEED && nearBody && nudgeCooldownSec <= 0) {
                // Batting the ball is a thrill — play begets play.
                emotionMeter.excite(0.35, 0.2);
                nudgeCooldownSec = 1.2;
              }
            }
            ballPrev[0] = pose[0];
            ballPrev[1] = pose[1];
            ballPrev[2] = pose[2];
            ballPrevValid = true;
          }
        }
      }

      // The flake: fall, get caught, be engulfed.
      if (flake) {
        flake.age += frameSec;
        if (flake.engulfing === null) {
          world.readPose(flake.body, flakePose, flakeQuat);
          flake.mesh.position.set(flakePose[0], flakePose[1], flakePose[2]);
          flake.mesh.quaternion.set(flakeQuat[0], flakeQuat[1], flakeQuat[2], flakeQuat[3]);
          world.readVelocity(flake.body, flakeVelocity);
          // The meal starts only once the body has actually crawled over the
          // flake — for the particle body that means particles genuinely
          // lapping above it, not mere proximity to the centroid. Without
          // that, the flake used to be declared "caught" from a body-radius
          // away and had to slide itself the rest of the way, which read as
          // the oat walking to the slime.
          const dx = flakePose[0] - slimeCenter[0];
          const dz = flakePose[2] - slimeCenter[2];
          let covered: boolean;
          if (USE_PARTICLES && particles) {
            let lapping = 0;
            const n = particles.particleCount;
            for (let i = 0; i < n; i++) {
              const px = particlePositions[i * 3] - flakePose[0];
              const py = particlePositions[i * 3 + 1] - flakePose[1];
              const pz = particlePositions[i * 3 + 2] - flakePose[2];
              if (px * px + pz * pz < 0.012 * 0.012 && py > 0.002) lapping += 1;
            }
            // A handful of particles overhead, or the flake tucked right
            // under the centroid — either way it is under the body, not
            // beside it.
            covered =
              lapping >= Math.max(4, n * 0.004) ||
              (Math.hypot(dx, dz) < 0.018 && flakePose[1] < slimeCenter[1]);
          } else {
            // The legacy soft body has no particle field to test; keep the
            // old generous-sideways, strict-upward sphere.
            covered = Math.hypot(dx, dz) < 0.036 && flakePose[1] < slimeCenter[1] + 0.02;
          }
          const settled = Math.hypot(...flakeVelocity) < 0.04;
          // Eating is gated on hunger *now*, not at drop time — a slime
          // never eats because food happens to be touching it — and on the
          // flake still being good. A missed meal is no longer tidied away:
          // it molds where it lies, and binning it is the player's chore.
          const edible = flake.age < OAT_MOLD_SEC && canFeed(state);
          if (
            (USE_PARTICLES ? particles : slime) &&
            flake.age > 0.4 &&
            covered &&
            settled &&
            edible
          ) {
            flake.engulfing = 0;
            // Roll this meal's length: half appetite, half chance. Satiety 0
            // leans hard toward the 5 s gobble; a nearly-full slime lingers.
            flake.engulfSec =
              ENGULF_MIN_SEC +
              (ENGULF_MAX_SEC - ENGULF_MIN_SEC) * (0.5 * state.satiety + 0.5 * Math.random());
            world.freeze(flake.body);
            // Catching a meal is the day's big event.
            emotionMeter.excite(0.5, 0.2);
          }
          // The mold blooms in once the flake has lain too long.
          flakeMoldUniform.value = THREE.MathUtils.clamp(
            (flake.age - OAT_MOLD_SEC) / OAT_MOLD_RAMP_SEC,
            0,
            1
          );
        } else {
          flake.engulfing += frameSec;
          const t = Math.min(1, flake.engulfing / flake.engulfSec);
          flakeDigestUniform.value = t;
          // Drawn in under the skirt, at floor level, shrinking as it goes —
          // the body is already draped over it by the coverage gate, so the
          // slide reads as digestion, not as the oat walking over.
          flakeDrawScratch.set(slimeCenter[0], FLOOR_Y + 0.001, slimeCenter[2]);
          // The draw-in paces itself to the meal, so a longer engulf means a
          // slower slide, not a quick slide and a long wait.
          flake.mesh.position.lerp(flakeDrawScratch, frameSec * (3.6 / flake.engulfSec));
          const shrink = 1 - t * 0.9;
          flake.mesh.scale.set(shrink, shrink, shrink);
          if (t >= 1) {
            removeFlake();
            applyFeed(state, Date.now());
            // A full belly is contentment more than excitement.
            emotionMeter.excite(0.1, 0.3);
            applyCareToBody();
            // A meal is a milestone, not a tick: written through, so closing
            // the tab a second later cannot un-eat it.
            flushSlime(state);
          }
        }
      }

      // The pseudopod: when a good flake sits just past the rim, a gooey
      // tongue reaches out for it and then rides it back under the skirt.
      // `tendrilReach` eases the tip out from the body toward the flake;
      // the solver's tendril attractor draws particles along, and the skin
      // wraps them into the visible goo. Extension is slower than release —
      // a deliberate reach, a quick let-go.
      if (USE_PARTICLES && particles) {
        let want = 0;
        if (flake) {
          const fp = flake.mesh.position;
          // Tongue range is the last stretch, not the whole tank: the lure
          // walks the body most of the way to a flake, and the tongue does
          // the final reach — a longer reach entrains the mound after it.
          const near = Math.hypot(fp.x - slimeCenter[0], fp.z - slimeCenter[2]) < 0.035;
          if (flake.engulfing !== null) {
            // Hold through the meal, letting go as the flake dissolves.
            const t = Math.min(1, flake.engulfing / flake.engulfSec);
            want = 1 - t * t;
          } else if (near && flake.age > 0.4 && flake.age < OAT_MOLD_SEC && canFeed(state)) {
            want = 1;
          }
        }
        tendrilReach +=
          (want - tendrilReach) * Math.min(1, frameSec * (want > tendrilReach ? 2.2 : 5));
        if (flake && tendrilReach > 0.05) {
          // Aim just above the flake, so the tongue drapes over the meal
          // rather than butting it; the solver walks its own tip out at goo
          // pace (see TENDRIL_TIP_SPEED).
          const fp = flake.mesh.position;
          particles.setTendril(
            fp.x,
            Math.max(FLOOR_Y + 0.004, fp.y + 0.004),
            fp.z,
            tendrilReach
          );
          tendrilOn = true;
        } else if (tendrilOn) {
          particles.clearTendril();
          tendrilOn = false;
          if (!flake) tendrilReach = 0;
        }
      }

      sprayFx.update(frameSec);
      powderFx.update(frameSec);
      dustFx.update(frameSec);
      crustShards.update(frameSec);
      condensation.update(frameSec, state.moisture, motionScale);
      placeCamera();
      camera.updateMatrixWorld();

      // The digestion cloud: tracks the engulf while it runs, then thins out.
      if (flake && flake.engulfing !== null) {
        digestValue = Math.min(1, flake.engulfing / flake.engulfSec);
        oatWorldScratch.copy(flake.mesh.position);
      } else {
        digestValue = Math.max(0, digestValue - frameSec / 2);
      }

      // The shadow map refreshes during the screen pass (autoUpdate is off),
      // but the interior pass renders first — so on the very first frame the
      // shadowed materials would sample three's 1×1 RGBA placeholder through
      // a shadow sampler. Chrome shrugs; Safari raises INVALID_OPERATION
      // ("mismatch between texture format and sampler type") and drops those
      // draws. One priming depth-only pass before anything else fixes it.
      if (!shadowMapPrimed) {
        shadowMapPrimed = true;
        renderer.shadowMap.needsUpdate = true;
        const prime = new THREE.WebGLRenderTarget(1, 1);
        renderer.setRenderTarget(prime);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        prime.dispose();
      }

      const bodyMesh = USE_PARTICLES ? surface.mesh : slimeMesh.mesh;
      const activeEyes = USE_PARTICLES ? particleEyes.group : eyes.group;
      if ((USE_PARTICLES ? particles : slime) && bodyMesh.visible) {
        // --- the three passes: interior, back depth, screen ----------------
        const size = renderer.getDrawingBufferSize(drawSizeScratch);
        ensureTargets(size.x, size.y);

        // Interior: the world without the slime's surface — but *with* what
        // is inside it. The eyes render here so their embedded halves are
        // seen through the jelly, refracted — and again in the screen pass,
        // where the depth-writing surface occludes everything below the
        // goo-line, leaving just the proud half of each half-embedded bead
        // sitting on the surface. Spray droplets are foreground and wait
        // for the screen pass.
        bodyMesh.visible = false;
        activeEyes.visible = eyesPresent;
        const sprayWasVisible = sprayFx.points.visible;
        sprayFx.points.visible = false;
        const powderWasVisible = powderFx.points.visible;
        powderFx.points.visible = false;
        const dustWasVisible = dustFx.points.visible;
        dustFx.points.visible = false;
        renderer.setRenderTarget(sceneTarget);
        renderer.render(scene, camera);

        renderer.setRenderTarget(backTarget);
        renderer.render(depthScene, camera);

        bodyMesh.visible = true;
        sprayFx.points.visible = sprayWasVisible;
        powderFx.points.visible = powderWasVisible;
        dustFx.points.visible = dustWasVisible;
        volume.setFrame(
          sceneTarget!.texture,
          sceneTarget!.depthTexture!,
          backTarget!.depthTexture!,
          size.x,
          size.y,
          camera
        );
        oatViewScratch.copy(oatWorldScratch).applyMatrix4(camera.matrixWorldInverse);
        volume.setDigestion(oatViewScratch, digestValue);

        caustic.update(slimeCenter[0], slimeCenter[2], state.moisture);

        // The screen pass detours through a colour target so depth of field
        // can composite it: the pet in focus, the planted room melting.
        // The shadow map refreshes here, the one pass where the body is
        // visible, so the pet's cast shadow is in it; the interior pass
        // reads the map a frame stale, which no eye can catch.
        renderer.shadowMap.needsUpdate = true;
        renderer.setRenderTarget(frameTarget);
        renderer.render(scene, camera);
        activeEyes.visible = false;
        renderer.setRenderTarget(null);
        // Focus follows the pet, with the focus *point* clamped inside the
        // box — the only place the pet can legitimately be. A physics mishap
        // that flings the body can then never take the picture out of focus
        // with it; the camera just focuses on where the pet ought to be.
        focusScratch.set(
          THREE.MathUtils.clamp(slimeCenter[0], -BOX_HALF_X, BOX_HALF_X),
          // The full carry range: a pet dangling at the top of the box is
          // still the subject, and the subject stays sharp.
          THREE.MathUtils.clamp(slimeCenter[1], FLOOR_Y, FLOOR_Y + BOX_HEIGHT),
          THREE.MathUtils.clamp(slimeCenter[2], -BOX_HALF_Z, BOX_HALF_Z)
        );
        const focus = focusScratch.distanceTo(camera.position);
        dof.render(
          renderer,
          frameTarget!.texture,
          sceneTarget!.depthTexture!,
          backTarget!.depthTexture!,
          size.x,
          size.y,
          camera,
          focus
        );
      } else {
        caustic.update(0, 0, 0);
        renderer.shadowMap.needsUpdate = true;
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      }

      return snapshot();
    },

    pointerDown(nx, ny, orbit) {
      lastPointer = [nx, ny];
      // A moldy oat is binned by clicking it, whatever is in hand — the
      // chore should never require a trip back to the drawer.
      if (!orbit && flake && flake.engulfing === null && flake.age >= OAT_MOLD_SEC) {
        const ray = pointerRay(nx, ny);
        const px = flakePose[0] - ray.origin[0];
        const py = flakePose[1] - ray.origin[1];
        const pz = flakePose[2] - ray.origin[2];
        const along = px * ray.dir[0] + py * ray.dir[1] + pz * ray.dir[2];
        const missSq = px * px + py * py + pz * pz - along * along;
        if (along > 0 && missSq < OAT_CLICK_RADIUS * OAT_CLICK_RADIUS) {
          removeFlake();
          return;
        }
      }
      if (!orbit && tool === 'squeegee') {
        // With the squeegee in hand every press goes to the glass; the
        // right button (or shift) still turns the box.
        if (squeegee.press(pointerRay(nx, ny))) {
          squeegeeStroke = true;
          return;
        }
      }
      if (!orbit && tool === 'mister') {
        this.spray([nx, ny]);
        return;
      }
      if (!orbit && tool === 'oats') {
        this.feed([nx, ny]);
        return;
      }
      if (!orbit && tool === 'mica') {
        this.sprinkle([nx, ny]);
        return;
      }
      // The ball is clicked with whatever is in hand, same as the moldy oat:
      // a click on the toy boots it off in a random bounce — fetch, played
      // from the human end.
      if (!orbit && ballOut && ballPrevValid) {
        const ray = pointerRay(nx, ny);
        const bx = ballPrev[0] - ray.origin[0];
        const by = ballPrev[1] - ray.origin[1];
        const bz = ballPrev[2] - ray.origin[2];
        const along = bx * ray.dir[0] + by * ray.dir[1] + bz * ray.dir[2];
        const missSq = bx * bx + by * by + bz * bz - along * along;
        if (along > 0 && missSq < BALL_CLICK_RADIUS * BALL_CLICK_RADIUS) {
          const angle = Math.random() * 2 * Math.PI;
          const speed = 0.12 + Math.random() * 0.22;
          solver.kickBall(
            Math.cos(angle) * speed,
            0.3 + Math.random() * 0.25,
            Math.sin(angle) * speed
          );
          // A booted ball is exciting — and the pet saw who did it.
          emotionMeter.excite(0.3, 0.1);
          return;
        }
      }
      if (!orbit && tool === 'pet' && particleHand && state.stage === 'active') {
        // Petting: a press on the body starts a stroke — affection, never a
        // carry. A press on the room still turns the box, same as the hand.
        const hit = castAtSlime(nx, ny);
        if (hit) {
          particleHand.press(pointerRay(nx, ny), hit.distance, 'pet');
          petTravel = 0;
          // A gentle touch is noticed right away — no poke-counting roll —
          // and it is pleasant from the first moment.
          pokeFace = hit.faceIndex;
          pokeWorld.copy(hit.point);
          pokeLookSec = POKE_LOOK_SEC;
          emotionMeter.excite(0.05, 0.08);
          return;
        }
      }
      if (
        !orbit &&
        tool === 'hand' &&
        (USE_PARTICLES ? particleHand : interaction) &&
        state.stage === 'active'
      ) {
        // A press lands on the slime or on the room. On the slime it is a
        // touch; anywhere else it turns the box.
        const hit = castAtSlime(nx, ny);
        if (hit) {
          if (USE_PARTICLES) particleHand!.press(pointerRay(nx, ny), hit.distance);
          else interaction!.press(pointerRay(nx, ny), [nx, ny], hit.faceIndex, hit.distance);
          // Poking a mouthful pops the cork: the ptooey fires right now,
          // and a player-triggered one is the bigger thrill.
          if (heldIdx >= 0) {
            springtails.eject(heldIdx, slimeCenter[0], slimeCenter[2]);
            spitWatchIdx = heldIdx;
            // The bout survives the flight: watch the landing, then chase.
            chaseUntil = Math.max(chaseUntil, sceneSec + 3);
            heldIdx = -1;
            if (telegraphActive) {
              telegraphActive = false;
              savorEnv = 0;
              particles?.setTuning(tuningViscosity, tuningPressure, tuningShape);
            }
            emotionMeter.excite(0.45, 0.2);
          }
          if (pokeBoutSec <= 0) {
            pokesSeen = 0;
            pokesToNotice = 1 + Math.floor(pokeRand() * 3);
          }
          pokeBoutSec = POKE_BOUT_SEC;
          pokesSeen += 1;
          emotionMeter.excite(0.3);
          if (pokesSeen >= pokesToNotice) {
            pokeFace = hit.faceIndex;
            pokeWorld.copy(hit.point);
            pokeLookSec = POKE_LOOK_SEC;
          }
          return;
        }
      }
      orbiting = true;
    },

    pointerMove(nx, ny) {
      if (squeegeeStroke) {
        squeegee.drag(pointerRay(nx, ny));
      } else if (orbiting) {
        const dx = nx - lastPointer[0];
        // A full turntable: every pane can be visited and squeegeed. Wrapped
        // into (-π, π] only so the angle never quietly grows without bound.
        azimuth -= dx * 1.6;
        if (azimuth > Math.PI) azimuth -= 2 * Math.PI;
        else if (azimuth <= -Math.PI) azimuth += 2 * Math.PI;
      } else {
        if (USE_PARTICLES) particleHand?.move(pointerRay(nx, ny));
        else interaction?.move(pointerRay(nx, ny), [nx, ny]);
        if (tool === 'squeegee') squeegee.hover(pointerRay(nx, ny));
        if (handState() === 'petting') {
          petTravel += Math.hypot(nx - lastPointer[0], ny - lastPointer[1]);
        }
      }
      lastPointer = [nx, ny];
    },

    pointerUp() {
      orbiting = false;
      squeegeeStroke = false;
      squeegee.release();
      interaction?.release();
      particleHand?.release();
    },

    setTool(next) {
      tool = next;
      if (next !== 'squeegee') {
        squeegeeStroke = false;
        squeegee.release();
      }
    },

    toggleBall() {
      if (ballOut) {
        putBallAway();
        return;
      }
      if (state.stage !== 'active') return;
      // Tossed in from somewhere over the tank — a random spot with a
      // little sideways life, so every arrival bounces differently.
      const margin = 0.016;
      const x = (Math.random() * 2 - 1) * (BOX_HALF_X - margin);
      const z = (Math.random() * 2 - 1) * (BOX_HALF_Z - margin);
      const drift = 0.06 + Math.random() * 0.08;
      const angle = Math.random() * 2 * Math.PI;
      solver.setBall(
        x,
        FLOOR_Y + BOX_HEIGHT - 0.015,
        z,
        BALL_RADIUS,
        Math.cos(angle) * drift,
        0,
        Math.sin(angle) * drift
      );
      ballOut = true;
      ballPrevValid = false;
      playUntil = 0;
      nextPlayAt = sceneSec + 1.5;
      // A new toy in the tank is exciting all by itself.
      emotionMeter.excite(0.3, 0.15);
    },

    spray(ndc) {
      // The care effect is global (moisture has no coordinates); the aim is
      // pure theatre, and the default aim is the pet itself.
      const target: [number, number, number] = ndc
        ? aimPoint(ndc[0], ndc[1])
        : state.stage === 'sclerotium'
          ? [0, FLOOR_Y + 0.008, 0]
          : [slimeCenter[0], slimeCenter[1] + 0.006, slimeCenter[2]];
      // The care effect waits for the droplets: moisture lands when the mist
      // does, not when the trigger is squeezed. A burst still in flight when
      // the next one fires settles up immediately rather than being lost.
      if (mistInFlightSec > 0) mistLands();
      mistInFlightSec = sprayFx.spray(target);
    },

    feed(ndc) {
      if (!canFeed(state) || flake || !(USE_PARTICLES ? particles : slime)) return;
      // Aimed, the flake falls over the pointed-at spot — onto the pet, or
      // wherever the aim actually was; the engulf check stays honest about
      // misses. Unaimed, it drops considerately over the pet.
      let x = slimeCenter[0] + 0.004;
      let z = slimeCenter[2];
      if (ndc) {
        const at = aimPoint(ndc[0], ndc[1]);
        x = at[0];
        z = at[2];
      }
      const body = world.addFlake([x, FLOOR_Y + 0.055, z]);
      const mesh = new THREE.Mesh(oatGeometry.geometry, oatMaterial.material);
      scene.add(mesh);
      flakeDigestUniform.value = 0;
      flakeMoldUniform.value = 0;
      flake = { body, mesh, age: 0, engulfing: null, engulfSec: ENGULF_MAX_SEC };
    },

    sprinkle(ndc) {
      if (!canSparkle(state)) return;
      // Like the mist, the sparkle itself has no coordinates — the pinch is
      // theatre, aimed where the pointer points or over the pet by default.
      const target: [number, number, number] = ndc
        ? aimPoint(ndc[0], ndc[1])
        : [slimeCenter[0], slimeCenter[1] + 0.006, slimeCenter[2]];
      powderFx.sprinkle(target);
      applySparkle(state);
      micaStrength = state.sparkle;
      volume.setMica(micaStrength);
      // Being dressed up is a small delight.
      emotionMeter.excite(0.2, 0.15);
      careTick();
      // Earned sparkle is a milestone, not a tick: written through.
      flushSlime(state);
    },

    flush() {
      // Called on tab-hide and pagehide: the viewer is leaving, so a soak
      // that completes in this very step already counts as unwitnessed.
      catchUpToNow(state, Date.now(), { witnessed: false });
      flushSlime(state);
      flushGrime(() => serializeGrime(grime.field));
    },

    setReducedMotion(reduced) {
      reducedMotion = reduced;
      motionScale = reduced ? 0.3 : 1;
      interaction?.setMotionScale(motionScale);
      particleHand?.setMotionScale(motionScale);
      springtails.setMotionScale(motionScale, !reduced);
    },

    setWitnessed(watching) {
      witnessed = watching;
    },

    setTuning(viscosity, pressure, shape) {
      tuningViscosity = viscosity;
      tuningPressure = pressure;
      tuningShape = shape;
      particles?.setTuning(viscosity, pressure, shape);
    },

    setMicaLook(size, amount) {
      volume.setMicaLook(size, amount);
    },
    setColorGrade(hueDegrees, saturation, lightness) {
      volume.setColorGrade(hueDegrees, saturation, lightness);
    },
    setFinish(finish) {
      volume.setFinish(finish);
    },
    setBreed(id) {
      state.breed = id;
      flushSlime(state);
    },

    setLighting(next) {
      lighting = next;
      applyLightingNow();
    },

    timeTravel(ms) {
      state.lastTickAt -= ms;
      // Unwitnessed, like the absence it fakes — which also means the dev
      // buttons let you actually watch the hatch, a second later.
      const result = catchUpToNow(state, Date.now(), { witnessed: false });
      // The faked absence gums the walls like a real one would.
      simulateGrimeAway(
        grime.field,
        result.elapsedSec,
        awayActivity(state.stage, state.vigor),
        (seed ^ Math.floor(state.lastTickAt / 1000)) >>> 0
      );
      applyStageScenery();
      applyCareToBody();
      flushSlime(state);
      flushGrime(() => serializeGrime(grime.field));
      return result;
    },

    emerge() {
      if (state.stage !== 'sclerotium') return;
      // The debug shortcut is only the *soak* skipped: fully wet, revival
      // done, stage flipped by hand. The hatch itself still plays through
      // stepCare like any other, so the emergence being debugged is real.
      state.moisture = 1;
      state.stage = 'waking';
      state.revival = 0;
      applyStageScenery();
      applyCareToBody();
      flushSlime(state);
    },

    recrust() {
      if (state.stage === 'sclerotium') return;
      // Only the drought is skipped: these are the same writes the natural
      // recrust in stepCare makes, plus the bone-dry moisture that days of
      // neglect would have left behind.
      state.stage = 'sclerotium';
      state.revival = 0;
      state.revivals += 1;
      state.drySec = 0;
      state.satiety = 0;
      state.sparkle = 0;
      state.moisture = 0;
      applyStageScenery();
      applyCareToBody();
      flushSlime(state);
    },

    takeArrivalResult() {
      const result = arrivalResult;
      arrivalResult = null;
      return result;
    },

    dispose() {
      flushSlime(state);
      flushGrime(() => serializeGrime(grime.field));
      removeFlake();
      interaction?.dispose();
      climb?.dispose();
      squeegee.dispose();
      world.dispose();
      terrarium.dispose();
      springtails.dispose();
      slimeMesh.dispose();
      surface.dispose();
      particleEyes.dispose();
      crust.dispose();
      crustShards.dispose();
      sprayFx.dispose();
      powderFx.dispose();
      dustFx.dispose();
      ballMesh.dispose();
      eyes.dispose();
      trails.dispose();
      grime.dispose();
      condensation.dispose();
      oatGeometry.dispose();
      oatMaterial.dispose();
      solver.dispose();
      volume.dispose();
      backDepthMaterial.dispose();
      caustic.dispose();
      dof.dispose();
      sceneTarget?.dispose();
      backTarget?.dispose();
      frameTarget?.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}

// Physics modules must never hot-swap: a scene holding closures over an old
// world while new modules load beside it renders ghosts of retired physics
// (a stale tab once showed the long-dead elastic gumdrop over the beanbag
// build). Any edit here forces a clean reload; the pet persists via storage.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
