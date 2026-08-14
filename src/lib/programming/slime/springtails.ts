import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../marimo/rng';
import { BOX_HALF_X, BOX_HALF_Z, FLOOR_Y } from './constants';
import type { TerrariumBody, TerrariumWorld } from './joltWorld';

/**
 * The cleanup crew: a handful of springtails living in the moss.
 *
 * Real bioactive terrariums keep them for exactly the job they do here —
 * they find anything going bad and eat it. Ours are pinhead-sized pale
 * specks that dart-and-pause across the bed (springtails do not stroll;
 * they sit still and then are somewhere else), and when an oat flake
 * moulds over they converge on it, mill around it, and slowly clear it:
 * the mold chore answers itself if you let the crew get to it, at crew
 * pace — clicking it away yourself is still much faster.
 *
 * Scene-side and cosmetic to the solver: they never push goo. They ride
 * the moss heightfield and step around the tank's stone, because a speck
 * ghosting through the landmark would give the whole trick away.
 *
 * They are not entirely safe, though. A hungry slime is a predator: any
 * critter that blunders under its skirt while the pet wants food gets
 * eaten (the scene passes the predator's footprint only while the slime
 * is awake, hungry, and on the ground). The moss replenishes the crew —
 * an eaten springtail respawns at the tank's edge after a while, as if a
 * new one wandered in from the substrate.
 */

/** How many live in the tank. */
const CREW = 10;
/** Body length, metres. Down from 1.1mm — real springtails are nearer a
 * half-millimetre, and at tank scale the bigger grains read as woodlice. */
const BODY = 0.0006;
/** A hop's travel speed, m/s, and its usual duration bounds, seconds. */
const HOP_SPEED = 0.014;
const HOP_MIN_SEC = 0.15;
const HOP_MAX_SEC = 0.5;
/** The pause between hops, seconds. Springtails mostly sit. */
const SIT_MIN_SEC = 0.4;
const SIT_MAX_SEC = 2.8;
/** Within this of the mold they are feeding, not travelling. */
const FEED_RADIUS = 0.009;
/**
 * The table's rim. Feeding crew mills around the flake at roughly this
 * distance rather than piling onto it — a ring of specks around dinner,
 * which is how a real culture eats, and it keeps the flake visible.
 */
const FEED_RING = 0.004;
/**
 * Critter-seconds of feeding that clear a flake. Six of the crew at the
 * flake for forty-five seconds, give or take the stragglers.
 */
const FEED_BUDGET = 260;
/** Seconds before the moss sends a replacement for an eaten critter. */
const RESPAWN_MIN_SEC = 35;
const RESPAWN_MAX_SEC = 90;
/**
 * The culture bloom: springtail cultures crash and rebound, and so does
 * this one. When the slime has eaten the crew down to this few, every
 * pending replacement is hurried in — a decimated tank restocks in
 * seconds, not minutes, so the crew never reads as gone for good.
 */
const BLOOM_THRESHOLD = 3;
const BLOOM_RESPAWN_SEC = 10;
/**
 * The furcula. A springtail's tail-spring is its whole escape plan: folded
 * under the body until something looms, then released, and the critter is
 * simply elsewhere. Here that means anyone inside the startle ring around
 * a hungry slime pings away — a teleport-hop of a centimetre or so, no
 * travel frames, which is exactly how it looks in a real tank. The spring
 * takes a moment to re-cock, so a predator that keeps coming still eats
 * the slow and the unlucky.
 */
const STARTLE_MULT = 1.5;
const JUMP_RECOCK_SEC = 1.5;
/** Odds the spring fires in time when the skirt is already overhead. */
const POINT_BLANK_ESCAPE = 0.45;
/**
 * The slurp-and-ptooey. A playful slime that actually catches its quarry
 * sucks it in, holds it a moment, and spits it back out in a lofted arc
 * across the tank — springtails are famously unbothered by this sort of
 * indignity. Toy gravity: real 9.81 m/s² at tank scale would be a
 * 30-millisecond blip; this arc hangs long enough to watch.
 *
 * And not one gravity but three — the Mario-jump lie. The rise floats,
 * the apex hangs an extra beat so the eye can find the peak, and the
 * fall snaps back down so the move ends crisply. A real parabola is
 * symmetric; a readable one has a slow middle and a punchy ending.
 */
const RISE_GRAVITY = 0.16;
const HANG_GRAVITY = 0.09;
const FALL_GRAVITY = 0.5;
/** |vertical speed| under this counts as "at the apex". */
const HANG_BAND = 0.012;
const SPIT_SPEED_MIN = 0.045;
const SPIT_SPEED_MAX = 0.075;
const SPIT_VY = 0.055;
/** Spat from up in the body, not from the floor. */
const SPIT_START_Y = 0.01;
/** One little bounce on touchdown, then done. */
const SPIT_RESTITUTION = 0.35;
/** The flyer stretches along its velocity, conserving volume. */
const STRETCH_MAX = 1.6;
/** Flight speed that maps to full stretch. */
const STRETCH_SPEED_REF = 0.09;
/** Squash-and-recover on the final touchdown, seconds. */
const LAND_SQUASH_SEC = 0.18;
/**
 * The critters are real Jolt bodies now. The collision proxy is a sphere
 * twice the visual body — Jolt's tolerances are tuned for centimetre
 * things, and a 1.2 mm sphere sits safely inside them where a 0.6 mm one
 * would drown in the contact skin. The grain is drawn at the moss while
 * the proxy carries the contacts.
 */
const CRITTER_RADIUS = 0.0012;
/** The Mario gravities, as fractions of the world's real 9.81. */
const RISE_FACTOR = RISE_GRAVITY / 9.81;
const HANG_FACTOR = HANG_GRAVITY / 9.81;
const FALL_FACTOR = FALL_GRAVITY / 9.81;
/**
 * The furcula as physics: a horizontal velocity burst this fast, held
 * this long. Seventy milliseconds is four rendered frames — it still
 * reads as "suddenly elsewhere", but now it glances off rocks en route.
 */
const ESCAPE_SPEED = 0.18;
const ESCAPE_SEC = 0.07;
/** Parked bodies (held, eaten) wait far above the tank, asleep. */
const PARK_Y = FLOOR_Y + 0.5;
/** Commanded-but-not-moving this long → turn (grinding a rock face). */
const STUCK_SEC = 0.2;
/** A spit that never settles (wedged mid-rock?) is forced down. */
const FLIGHT_TIMEOUT_SEC = 4;

/**
 * Replacements are juveniles: they wander in at a fraction of adult size
 * and grow to full over a couple of minutes, so the moss visibly raises
 * new crew rather than teleporting adults into the tank.
 */
const JUVENILE_SCALE = 0.55;
const GROW_SEC = 120;
/**
 * How quickly a critter in the startle ring notices the threat, per
 * second. Not instant: springtails are alert, not omniscient, and a
 * quick hop can carry an oblivious one right under the skirt — which is
 * how the slime gets fed at all.
 */
const STARTLE_RATE = 2.5;

/** The slime's footprint, while it is in a state to eat or chase crew. */
export interface SpringtailPredator {
  x: number;
  z: number;
  radius: number;
  /**
   * A playful footprint startles the crew — same furcula pings, same
   * scatter — but never eats anyone. This is the chase game: a content,
   * well-fed slime tagging critters just to watch them go.
   */
  playful?: boolean;
}

export interface SpringtailsUpdateResult {
  /** True exactly once per moldy flake, when the crew has eaten it through. */
  moldCleared: boolean;
  /** How many of the crew the slime ate this step. */
  eaten: number;
  /**
   * How far through the moldy flake the crew has eaten, 0..1. The scene
   * can shrink the flake with this so the cleanup reads as it happens,
   * not only when the flake finally vanishes.
   */
  feedProgress: number;
  /**
   * How many furcula escapes the footprint set off this step — the
   * "tag" events of the chase game, and the near-misses of a hunt.
   */
  pinged: number;
  /**
   * Where spat critters finally settled this step (after the bounce), or
   * null when none did — the scene's cue for a landing dust puff. The
   * array is reused between updates; copy what you keep.
   */
  landings: Array<[number, number]> | null;
}

export interface SpringtailsBundle {
  mesh: THREE.InstancedMesh;
  /**
   * The crew's will, run inside the fixed-step sim loop BEFORE
   * `world.step`: reads body poses, makes decisions, writes velocities
   * and gravity factors. `moldAt` is the moldy flake's position while
   * one exists; `predator` the slime's footprint while it can eat or
   * chase. Events (eaten, pings, landings, feeding) accumulate across
   * substeps and are handed out by the next `update` call.
   */
  stepPhysics(
    dt: number,
    moldAt: readonly number[] | null,
    predator?: SpringtailPredator | null
  ): void;
  /**
   * The crew's look, run once per rendered frame AFTER stepping: fills
   * the instance matrices from the live poses (gait, stretch, squash,
   * juvenile scale) and returns everything that happened since the last
   * call. When `moldCleared` comes back true the scene tidies the flake.
   */
  update(frameSec: number): SpringtailsUpdateResult;
  /** The live critter nearest a point, or -1 with the tank empty. */
  nearestLive(x: number, z: number): number;
  /**
   * A live critter's floor position, or null if it has been eaten or is
   * currently held inside the slime.
   */
  positionOf(index: number): [number, number] | null;
  /**
   * Suck a critter in: it vanishes into the slime, unharmed, until
   * `eject`. False if it is dead, already held, or mid-flight.
   */
  capture(index: number): boolean;
  /**
   * Ptooey: spit a held critter out of the slime at (fromX, fromZ), on a
   * lofted arc aimed loosely at open tank. It lands, sits a rattled
   * beat, and dashes off. No-op unless the critter is held.
   */
  eject(index: number, fromX: number, fromZ: number): void;
  /**
   * A critter's 3D world position while it is on the spit arc, or null —
   * the gaze target for eyes that follow the show.
   */
  flightPositionOf(index: number): [number, number, number] | null;
  /**
   * Reduced motion: the crew moves at a fraction of its usual darting.
   * `flourish` false also drops the spit stretch, squash, and bounce —
   * the arc still flies, plainly.
   */
  setMotionScale(scale: number, flourish?: boolean): void;
  dispose(): void;
}

export function createSpringtails(
  seed: number,
  groundHeightAt: (x: number, z: number) => number,
  stones: ReadonlyArray<{ x: number; z: number; radius: number }>,
  world: TerrariumWorld
): SpringtailsBundle {
  const rand = mulberry32((seed ^ 0x5b121) >>> 0);

  /**
   * Pose mirrors, refreshed from the bodies each physics step. All the
   * decision logic reads these; only the world writes them. `x`/`z`/`py`
   * are the proxy sphere's centre; `vx`/`vy`/`vz` its velocity.
   */
  const x = new Float32Array(CREW);
  const z = new Float32Array(CREW);
  const py = new Float32Array(CREW);
  const vx = new Float32Array(CREW);
  const vy = new Float32Array(CREW);
  const vz = new Float32Array(CREW);
  const heading = new Float32Array(CREW);
  /** Seconds left in the current mode; sign of `moving` says which. */
  const timer = new Float32Array(CREW);
  const moving = new Uint8Array(CREW);
  const sizes = new Float32Array(CREW);
  /** 1 while in the tank; 0 while eaten and waiting to be replaced. */
  const alive = new Uint8Array(CREW).fill(1);
  /** Seconds until an eaten critter's replacement wanders in. */
  const respawnIn = new Float32Array(CREW);
  /** Seconds until the furcula is re-cocked and can fire again. */
  const recock = new Float32Array(CREW);
  /** Growth fraction: juveniles start below 1 and grow into it. */
  const grown = new Float32Array(CREW).fill(1);
  /** 1 while swallowed-for-fun: parked out of the world, safe. */
  const held = new Uint8Array(CREW);
  /** 1 while on the spit arc. */
  const flying = new Uint8Array(CREW);
  /** Seconds of spit flight so far — the never-settles safety clock. */
  const flightSec = new Float32Array(CREW);
  /** Seconds left of the furcula's velocity burst. */
  const escaping = new Float32Array(CREW);
  /** Seconds spent commanded-but-stationary — the rock-face turn. */
  const stuckSec = new Float32Array(CREW);
  /** Last step's vy, for spotting the arrested fall that is a landing. */
  const prevVy = new Float32Array(CREW);
  /** 1 once the spit arc has used its one bounce. */
  const bounced = new Uint8Array(CREW);
  /** Seconds of landing squash left after the final touchdown. */
  const landSquash = new Float32Array(CREW);

  const bodyHandles: TerrariumBody[] = [];
  const poseScratch: [number, number, number] = [0, 0, 0];
  const quatScratch: [number, number, number, number] = [0, 0, 0, 1];
  const velScratch: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < CREW; i++) {
    x[i] = (rand() * 2 - 1) * (BOX_HALF_X - 0.006);
    z[i] = (rand() * 2 - 1) * (BOX_HALF_Z - 0.006);
    heading[i] = rand() * Math.PI * 2;
    timer[i] = rand() * SIT_MAX_SEC;
    sizes[i] = 0.75 + rand() * 0.5;
    py[i] = FLOOR_Y + CRITTER_RADIUS;
    bodyHandles.push(world.addCritter(CRITTER_RADIUS, [x[i], py[i], z[i]]));
  }

  // The body grain, plus a pair of antennae — springtails wear theirs
  // long and forward, and even at speck size the silhouette reads. Both
  // prongs are merged into the body geometry so every instance carries
  // them through the same matrix: they elongate, squash, and turn with
  // the grain for free. Local +z is forward (the heading axis).
  const body = new THREE.IcosahedronGeometry(1, 1);
  /**
   * Tag a part for the gait shader: every vertex carries a swing phase
   * (which beat of the scuttle it moves on) and a weight (how far out
   * the limb it sits — hips stay planted, feet swing furthest). The
   * body is tagged with zero weight so only the limbs animate.
   */
  const tagForGait = (
    part: THREE.BufferGeometry,
    phase: number,
    weightOfY: (y: number) => number
  ): void => {
    const pos = part.getAttribute('position');
    const phases = new Float32Array(pos.count).fill(phase);
    const weights = new Float32Array(pos.count);
    for (let v = 0; v < pos.count; v++) weights[v] = weightOfY(pos.getY(v));
    part.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    part.setAttribute('aWeight', new THREE.BufferAttribute(weights, 1));
  };
  tagForGait(body, 0, () => 0);
  const parts: THREE.BufferGeometry[] = [body];
  for (const side of [-1, 1]) {
    const antenna = new THREE.CylinderGeometry(0.03, 0.07, 1.3, 4, 1);
    antenna.translate(0, 0.65, 0); // pivot at the base, not the middle
    // Feelers wave gently, strongest at the tips, the pair out of step.
    tagForGait(antenna, side > 0 ? 0 : Math.PI * 0.7, (y) => (y / 1.3) * 0.3);
    antenna.rotateX(Math.PI / 2 - 0.45); // sweep forward, tipped up
    antenna.rotateY(side * 0.35); // splayed out to its own side
    antenna.translate(side * 0.18, 0.3, 0.75); // rooted at the head
    // The icosahedron is non-indexed; the merge needs the parts to agree.
    parts.push(antenna.toNonIndexed());
    antenna.dispose();
  }
  // Six wire legs, three a side, on a tripod gait: alternate legs swing
  // on opposite beats, which is how insects actually cross a floor.
  const LEG = 0.55;
  [-1, 1].forEach((side, s) => {
    [0.45, 0, -0.45].forEach((along, a) => {
      const leg = new THREE.CylinderGeometry(0.02, 0.035, LEG, 3, 1);
      leg.translate(0, -LEG / 2, 0); // hip at the origin, foot below
      tagForGait(leg, ((a + s) % 2) * Math.PI + a * 0.3, (y) => -y / LEG);
      leg.rotateZ(side * 0.7); // kicked out to its own side
      leg.translate(side * 0.45, -0.1, along);
      parts.push(leg.toNonIndexed());
      leg.dispose();
    });
  });
  const geometry = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  /**
   * The gait, per critter: 0 frozen, a whisper while sitting (feet
   * fidget, feelers wave), full scuttle on the move. Instanced so one
   * draw call still carries ten differently-busy critters.
   */
  const gait = new Float32Array(CREW).fill(0.25);
  const gaitAttr = new THREE.InstancedBufferAttribute(gait, 1);
  gaitAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aGait', gaitAttr);
  // A fixed random beat offset each, so the crew never scuttles in unison.
  const wobble = new Float32Array(CREW);
  for (let i = 0; i < CREW; i++) wobble[i] = rand() * Math.PI * 2;
  geometry.setAttribute('aWobble', new THREE.InstancedBufferAttribute(wobble, 1));

  // Pale buff-white, the classic springtail; a whisper of per-critter tint.
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  /**
   * The scuttle itself lives in the vertex shader: limb vertices shear
   * fore-and-aft on their tagged beat, weighted toward the feet, and
   * swinging legs lift a little as they come forward. All in the local
   * frame, before the instance matrix, so it survives the squash, the
   * juvenile scale, and the heading turn untouched.
   */
  const timeUniform = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        [
          '#include <common>',
          'attribute float aPhase;',
          'attribute float aWeight;',
          'attribute float aGait;',
          'attribute float aWobble;',
          'uniform float uTime;'
        ].join('\n')
      )
      .replace(
        '#include <begin_vertex>',
        [
          '#include <begin_vertex>',
          'float beat = uTime * 16.0 + aPhase + aWobble;',
          'float reach = aWeight * aGait;',
          'transformed.z += sin(beat) * 0.45 * reach;',
          'transformed.y += (0.5 + 0.5 * cos(beat)) * 0.2 * reach;'
        ].join('\n')
      );
  };
  const mesh = new THREE.InstancedMesh(geometry, material, CREW);
  const colour = new THREE.Color();
  for (let i = 0; i < CREW; i++) {
    colour.setHex(0xd9d4c2);
    colour.offsetHSL((rand() - 0.5) * 0.02, 0, (rand() - 0.5) * 0.06);
    mesh.setColorAt(i, colour);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const FORWARD = new THREE.Vector3(0, 0, 1);
  const velocityDir = new THREE.Vector3();

  let motionScale = 1;
  /** False under reduced motion: no stretch, no squash, no bounce. */
  let flourish = true;
  let feedSec = 0;
  let consumed = false;
  /** Settle positions collected this update; reused between frames. */
  const landings: Array<[number, number]> = [];

  /** Height of the proxy's underside above the flat physics floor. */
  function airAbovePhysicsFloor(i: number): number {
    return Math.max(0, py[i] - FLOOR_Y - CRITTER_RADIUS);
  }

  function place(i: number): void {
    const ground = groundHeightAt(x[i], z[i]);
    // The physics floor is flat; the moss relief is a drawing. Grounded
    // critters sit on the moss; airborne ones keep their physics height
    // above it, so an arc over a moss hump still clears it visually.
    const visAir = Math.max(0, airAbovePhysicsFloor(i) - ground);
    position.set(x[i], FLOOR_Y + ground + BODY * 0.35 + visAir, z[i]);
    // A grain elongated along its heading, squashed to the ground.
    // An eaten or held critter is scaled to nothing rather than removed —
    // the instanced mesh keeps a fixed count.
    const s = alive[i] && !held[i] ? BODY * sizes[i] * grown[i] : 0;
    scale.set(s * 0.7, s * 0.55, s);
    if (flying[i] && flourish) {
      // Mid-arc: the grain tips its nose along its actual 3D velocity
      // and stretches with speed, volume conserved — an arrow on the
      // way, not a tumbling speck.
      const speed = Math.hypot(vx[i], vy[i], vz[i]);
      if (speed > 1e-6) {
        velocityDir.set(vx[i] / speed, vy[i] / speed, vz[i] / speed);
        quaternion.setFromUnitVectors(FORWARD, velocityDir);
      } else {
        euler.set(0, heading[i], 0);
        quaternion.setFromEuler(euler);
      }
      const stretch = 1 + (STRETCH_MAX - 1) * Math.min(1, speed / STRETCH_SPEED_REF);
      const thin = 1 / Math.sqrt(stretch);
      scale.set(scale.x * thin, scale.y * thin, scale.z * stretch);
    } else {
      euler.set(0, heading[i], 0);
      quaternion.setFromEuler(euler);
      if (landSquash[i] > 0 && flourish) {
        // The touchdown squash: briefly wide and flat, then itself again.
        const q = 1 + 0.4 * (landSquash[i] / LAND_SQUASH_SEC);
        scale.set(scale.x * q, scale.y / q, scale.z * q);
      }
    }
    mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
  }

  /** Refresh one critter's pose and velocity mirrors from its body. */
  function readBody(i: number): void {
    world.readPose(bodyHandles[i], poseScratch, quatScratch);
    x[i] = poseScratch[0];
    py[i] = poseScratch[1];
    z[i] = poseScratch[2];
    world.readVelocity(bodyHandles[i], velScratch);
    vx[i] = velScratch[0];
    vy[i] = velScratch[1];
    vz[i] = velScratch[2];
  }

  /** Park a body out of the world — the held and the eaten wait here. */
  function park(i: number): void {
    world.setGravityFactor(bodyHandles[i], 1);
    world.setPosition(bodyHandles[i], [0, PARK_Y, 0], false);
    world.setActive(bodyHandles[i], false);
    vx[i] = 0;
    vy[i] = 0;
    vz[i] = 0;
  }

  /** A replacement wanders in from the tank's edge, well clear of rocks. */
  function respawn(i: number): void {
    const margin = 0.006;
    let rx = 0;
    let rz = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      // A point along one of the four walls.
      if (rand() < 0.5) {
        rx = rand() < 0.5 ? -(BOX_HALF_X - margin) : BOX_HALF_X - margin;
        rz = (rand() * 2 - 1) * (BOX_HALF_Z - margin);
      } else {
        rx = (rand() * 2 - 1) * (BOX_HALF_X - margin);
        rz = rand() < 0.5 ? -(BOX_HALF_Z - margin) : BOX_HALF_Z - margin;
      }
      if (stones.every((s) => Math.hypot(rx - s.x, rz - s.z) > s.radius)) break;
    }
    x[i] = rx;
    z[i] = rz;
    py[i] = FLOOR_Y + CRITTER_RADIUS;
    world.setPosition(bodyHandles[i], [rx, py[i], rz], true);
    alive[i] = 1;
    recock[i] = 0;
    grown[i] = JUVENILE_SCALE;
    heading[i] = rand() * Math.PI * 2;
    moving[i] = 0;
    escaping[i] = 0;
    timer[i] = SIT_MIN_SEC + rand() * (SIT_MAX_SEC - SIT_MIN_SEC);
  }

  /**
   * The furcula fires: a real velocity burst directly away from the
   * threat. No teleport any more — the ping is honest ballistics now,
   * which is how it glances off a rock instead of ghosting through.
   */
  function escapeJump(i: number, fromX: number, fromZ: number): void {
    const dx = x[i] - fromX;
    const dz = z[i] - fromZ;
    const d = Math.hypot(dx, dz);
    // Away from the predator, or anywhere at all if it is right on top.
    const away = d > 1e-6 ? Math.atan2(dx, dz) : rand() * Math.PI * 2;
    const dir = away + (rand() - 0.5) * 0.8;
    const burst = ESCAPE_SPEED * (0.75 + rand() * 0.5) * motionScale;
    world.setGravityFactor(bodyHandles[i], 1);
    world.setLinearVelocity(bodyHandles[i], [Math.sin(dir) * burst, 0.02, Math.cos(dir) * burst]);
    escaping[i] = ESCAPE_SEC;
    heading[i] = dir;
    recock[i] = JUMP_RECOCK_SEC;
    // It lands sitting, catching its breath before the next wander.
    moving[i] = 0;
    timer[i] = SIT_MIN_SEC + rand() * (SIT_MAX_SEC - SIT_MIN_SEC) * 0.5;
  }

  for (let i = 0; i < CREW; i++) place(i);
  mesh.instanceMatrix.needsUpdate = true;

  // Events accumulate across the frame's physics substeps and are handed
  // out (and cleared) by the next `update` call.
  let eatenAcc = 0;
  let pingedAcc = 0;
  let moldClearedAcc = false;

  return {
    mesh,

    stepPhysics(dt, moldAt, predator = null) {
      if (!moldAt) {
        feedSec = 0;
        consumed = false;
      }
      let feeding = 0;
      let aliveCount = 0;
      for (let i = 0; i < CREW; i++) {
        if (alive[i]) aliveCount += 1;
      }
      // The bloom: a crew eaten down to stragglers hurries its replacements.
      if (aliveCount <= BLOOM_THRESHOLD) {
        for (let i = 0; i < CREW; i++) {
          if (!alive[i]) respawnIn[i] = Math.min(respawnIn[i], BLOOM_RESPAWN_SEC);
        }
      }
      for (let i = 0; i < CREW; i++) {
        if (!alive[i]) {
          respawnIn[i] -= dt;
          if (respawnIn[i] <= 0) respawn(i);
          continue;
        }
        // Held critters wait parked out of the world: hidden, safe.
        if (held[i]) continue;
        const lastVy = prevVy[i];
        readBody(i);
        prevVy[i] = vy[i];
        // The spit arc: the body flies it for real now — walls, rocks,
        // everything — while the gravity factor tells the Mario lie.
        // Mid-air a critter is above every mouth and every worry.
        if (flying[i]) {
          flightSec[i] += dt;
          // Three gravities, picked by where the arc is: floaty going
          // up, hovering at the apex, snappy coming down. The bounce
          // gets no float at all — it is an ending, not a second act.
          const factor = bounced[i]
            ? FALL_FACTOR
            : vy[i] > HANG_BAND
              ? RISE_FACTOR
              : vy[i] > -HANG_BAND
                ? HANG_FACTOR
                : FALL_FACTOR;
          world.setGravityFactor(bodyHandles[i], factor);
          // A landing is an arrested fall: it was dropping, and contact
          // (floor, moss-level rock shelf) stopped it. Restitution is
          // zero, so the choreography below owns what happens next.
          const arrested = lastVy < -0.02 && vy[i] > -0.005;
          const timedOut = flightSec[i] > FLIGHT_TIMEOUT_SEC;
          if (arrested || timedOut) {
            if (flourish && !bounced[i] && !timedOut && Math.abs(lastVy) > 0.01) {
              // One little bounce — enough to say "landed", not enough
              // to start a dribble.
              bounced[i] = 1;
              world.setLinearVelocity(bodyHandles[i], [
                vx[i] * 0.6,
                Math.abs(lastVy) * SPIT_RESTITUTION,
                vz[i] * 0.6
              ]);
            } else {
              // Touchdown for real: a squash, a rattled beat on the
              // moss, then off it dashes.
              flying[i] = 0;
              bounced[i] = 0;
              flightSec[i] = 0;
              moving[i] = 0;
              timer[i] = 0.15 + rand() * 0.3;
              heading[i] = rand() * Math.PI * 2;
              landSquash[i] = LAND_SQUASH_SEC;
              world.setGravityFactor(bodyHandles[i], 1);
              world.setLinearVelocity(bodyHandles[i], [0, 0, 0]);
              landings.push([x[i], z[i]]);
            }
          }
          continue;
        }
        // The furcula's burst plays out on its own: no steering until
        // the spring's energy is spent.
        if (escaping[i] > 0) {
          escaping[i] -= dt;
          if (escaping[i] <= 0) {
            world.setLinearVelocity(bodyHandles[i], [0, vy[i], 0]);
          }
          continue;
        }
        if (recock[i] > 0) recock[i] -= dt;
        // The predator check comes first: a hungry slime looming is the
        // most urgent thing in a springtail's world, moving or sitting.
        if (predator) {
          const pd = Math.hypot(x[i] - predator.x, z[i] - predator.z);
          if (pd < predator.radius) {
            // Under the skirt already. A cocked furcula might still save
            // it; a spent one, or a slow release, and it is dinner —
            // unless the footprint is only playing, in which case a spent
            // spring just means being walked over, indignant but whole.
            if (recock[i] <= 0 && (predator.playful || rand() < POINT_BLANK_ESCAPE)) {
              escapeJump(i, predator.x, predator.z);
              pingedAcc += 1;
            } else if (!predator.playful) {
              alive[i] = 0;
              respawnIn[i] = RESPAWN_MIN_SEC + rand() * (RESPAWN_MAX_SEC - RESPAWN_MIN_SEC);
              eatenAcc += 1;
              park(i);
            }
            continue;
          }
          if (
            pd < predator.radius * STARTLE_MULT &&
            recock[i] <= 0 &&
            rand() < 1 - Math.exp(-STARTLE_RATE * dt)
          ) {
            // Startled inside the ring: ping first, wonder later.
            escapeJump(i, predator.x, predator.z);
            pingedAcc += 1;
            continue;
          }
        }
        timer[i] -= dt;
        const atMold =
          moldAt !== null && Math.hypot(x[i] - moldAt[0], z[i] - moldAt[2]) < FEED_RADIUS;
        if (atMold) feeding += 1;
        if (timer[i] <= 0) {
          if (moving[i]) {
            moving[i] = 0;
            timer[i] = SIT_MIN_SEC + rand() * (SIT_MAX_SEC - SIT_MIN_SEC);
            // Feeding crew barely wanders; sitting on dinner is the point.
            if (atMold) timer[i] *= 2;
            // One zero-horizontal write, then silence: damping and the
            // sleep threshold turn the sit into a sleeping body.
            world.setLinearVelocity(bodyHandles[i], [0, vy[i], 0]);
          } else {
            moving[i] = 1;
            stuckSec[i] = 0;
            timer[i] = HOP_MIN_SEC + rand() * (HOP_MAX_SEC - HOP_MIN_SEC);
            if (moldAt && !atMold) {
              // Head for the mold, with enough wobble to arrive as a
              // crowd rather than a queue.
              heading[i] =
                Math.atan2(moldAt[0] - x[i], moldAt[2] - z[i]) + (rand() - 0.5) * 0.9;
            } else if (moldAt && atMold) {
              // At the table: mill around the rim, not over the flake.
              // A critter on top of dinner drifts back off it; the rest
              // circle, half one way, half the other.
              const mx = x[i] - moldAt[0];
              const mz = z[i] - moldAt[2];
              const outward = Math.atan2(mx, mz);
              if (Math.hypot(mx, mz) < FEED_RING * 0.6) {
                heading[i] = outward + (rand() - 0.5) * 0.6;
              } else {
                heading[i] =
                  outward + (Math.PI / 2) * (rand() < 0.5 ? 1 : -1) + (rand() - 0.5) * 0.5;
              }
            } else {
              heading[i] = rand() * Math.PI * 2;
            }
          }
        }
        if (moving[i]) {
          const pace = HOP_SPEED * motionScale;
          // Walls and rocks are real now: no clamps, no push-outs. A
          // critter grinding a face it cannot cross just turns instead.
          const measured = Math.hypot(vx[i], vz[i]);
          if (measured < pace * 0.3) {
            stuckSec[i] += dt;
            if (stuckSec[i] >= STUCK_SEC) {
              stuckSec[i] = 0;
              heading[i] += Math.PI * (0.75 + rand() * 0.5);
            }
          } else {
            stuckSec[i] = 0;
          }
          world.setLinearVelocity(bodyHandles[i], [
            Math.sin(heading[i]) * pace,
            vy[i],
            Math.cos(heading[i]) * pace
          ]);
        }
      }

      if (moldAt && !consumed) {
        feedSec += dt * feeding;
        if (feedSec >= FEED_BUDGET) {
          consumed = true;
          feedSec = 0;
          moldClearedAcc = true;
        }
      }
    },

    update(frameSec) {
      // The gait clock; reduced motion slows the scuttle with everything else.
      const dt = Math.min(frameSec, 0.1);
      timeUniform.value += dt * motionScale;
      for (let i = 0; i < CREW; i++) {
        const target = !alive[i] || held[i] ? 0 : moving[i] || flying[i] ? 1 : 0.25;
        gait[i] += (target - gait[i]) * Math.min(1, dt * 8);
        // The landing squash plays out over a few frames on the ground.
        if (landSquash[i] > 0) landSquash[i] = Math.max(0, landSquash[i] - dt);
        // Juveniles grow into their adult size as they wander.
        if (alive[i] && !held[i] && grown[i] < 1) {
          grown[i] = Math.min(1, grown[i] + (dt * (1 - JUVENILE_SCALE)) / GROW_SEC);
        }
        place(i);
      }
      gaitAttr.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;

      const result: SpringtailsUpdateResult = {
        moldCleared: moldClearedAcc,
        eaten: eatenAcc,
        feedProgress: consumed ? 1 : Math.min(1, feedSec / FEED_BUDGET),
        pinged: pingedAcc,
        // A rare event and a tiny array: hand out a copy so the reused
        // accumulator can be cleared without pulling the rug.
        landings: landings.length > 0 ? landings.slice() : null
      };
      moldClearedAcc = false;
      eatenAcc = 0;
      pingedAcc = 0;
      landings.length = 0;
      return result;
    },

    nearestLive(px, pz) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < CREW; i++) {
        if (!alive[i] || held[i]) continue;
        const d = Math.hypot(x[i] - px, z[i] - pz);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    },

    positionOf(index) {
      if (index < 0 || index >= CREW || !alive[index] || held[index]) return null;
      return [x[index], z[index]];
    },

    capture(index) {
      if (index < 0 || index >= CREW) return false;
      if (!alive[index] || held[index] || flying[index]) return false;
      held[index] = 1;
      park(index);
      place(index);
      mesh.instanceMatrix.needsUpdate = true;
      return true;
    },

    eject(index, fromX, fromZ) {
      if (index < 0 || index >= CREW || !held[index]) return;
      held[index] = 0;
      flying[index] = 1;
      const margin = 0.004;
      x[index] = Math.min(BOX_HALF_X - margin, Math.max(-(BOX_HALF_X - margin), fromX));
      z[index] = Math.min(BOX_HALF_Z - margin, Math.max(-(BOX_HALF_Z - margin), fromZ));
      py[index] = FLOOR_Y + CRITTER_RADIUS + SPIT_START_Y;
      world.setPosition(bodyHandles[index], [x[index], py[index], z[index]], true);
      // Aimed loosely at the middle of the tank, so the arc stays in
      // frame instead of splatting straight into the near wall.
      const dir = Math.atan2(-x[index], -z[index]) + (rand() - 0.5) * 1.6;
      const speed = SPIT_SPEED_MIN + rand() * (SPIT_SPEED_MAX - SPIT_SPEED_MIN);
      vx[index] = Math.sin(dir) * speed;
      vz[index] = Math.cos(dir) * speed;
      vy[index] = SPIT_VY * (0.8 + rand() * 0.4);
      prevVy[index] = vy[index];
      world.setLinearVelocity(bodyHandles[index], [vx[index], vy[index], vz[index]]);
      world.setGravityFactor(bodyHandles[index], RISE_FACTOR);
      heading[index] = dir;
      recock[index] = 0;
      bounced[index] = 0;
      flightSec[index] = 0;
      landSquash[index] = 0;
      place(index);
      mesh.instanceMatrix.needsUpdate = true;
    },

    flightPositionOf(index) {
      if (index < 0 || index >= CREW || !flying[index]) return null;
      const ground = groundHeightAt(x[index], z[index]);
      const visAir = Math.max(0, airAbovePhysicsFloor(index) - ground);
      return [x[index], FLOOR_Y + ground + BODY * 0.35 + visAir, z[index]];
    },

    setMotionScale(scale_, flourish_ = true) {
      motionScale = Math.max(0.2, scale_);
      flourish = flourish_;
    },

    dispose() {
      for (const handle of bodyHandles) world.remove(handle);
      geometry.dispose();
      material.dispose();
    }
  };
}
