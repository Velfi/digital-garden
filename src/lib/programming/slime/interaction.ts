import {
  BOX_HALF_X,
  BOX_HALF_Z,
  BOX_HEIGHT,
  FINGER_FLOOR_CLEARANCE,
  FINGER_MAX_DEPTH,
  FINGER_PRESS_SEC,
  FINGER_RADIUS,
  FLOOR_Y,
  GRAB_BOX_MARGIN,
  GRAB_LIFT_GAIN,
  GRAB_MIN_LIFT,
  GRAB_NDC_THRESHOLD,
  GRAB_OMEGA,
  GRAB_STEER_SPEED,
  GRAB_THROW_SPEED
} from './constants';
import { edgesOf, type EggMesh } from './eggMesh';
import type { SlimeBody, TerrariumBody, TerrariumWorld } from './joltWorld';

/**
 * The hand: what a pointer press does to the slime.
 *
 * Two gestures share one press, split by what the hand does next. Press and
 * hold, and a kinematic finger sphere pushes in along the view ray — ordinary
 * soft-vs-rigid contact makes the dent, and the slime's own pressure pushes it
 * back out when the finger leaves. Drag past a small threshold, and the press
 * becomes a grab: the finger goes away, and the vertices around the original
 * hit are *steered* — each step they are handed a velocity toward their spot
 * under an anchor that chases the pointer on a critically-damped spring,
 * capped at a grip speed. Masses stay real and positions stay the solver's,
 * which is the stability of the whole scheme: yank the pointer violently and
 * the grip slips rather than storing spring energy in the mesh (the old
 * infinite-mass pins snapped back at 20 m/s and shredded the body). Release
 * is nothing but ceasing to steer, so a dropped slime leaves the hand at
 * whatever speed the hand was actually moving it.
 *
 * Rays come in as plain arrays rather than THREE objects so this file stays
 * pure maths — the scene owns the camera; the tests own everything here.
 */

export type Vec = [number, number, number];

/**
 * Rays are read, never written — declared readonly so callers (including the
 * physics thread's sweep tests) can hand in frozen tuples.
 */
export interface PointerRay {
  origin: readonly [number, number, number];
  dir: readonly [number, number, number];
}

export type InteractionState = 'idle' | 'poking' | 'grabbing';

export interface Interaction {
  /**
   * A press that landed on the slime. `faceIndex` picks the grab cluster;
   * `hitDistance` is along the ray, which is where both the finger and the
   * anchor live from now on.
   */
  press(
    ray: PointerRay,
    ndc: readonly [number, number],
    faceIndex: number,
    hitDistance: number
  ): void;
  move(ray: PointerRay, ndc: readonly [number, number]): void;
  release(): void;
  /** Advance the hand. Call once per fixed step, before the world steps. */
  step(dt: number): void;
  state(): InteractionState;
  /** Damp the carry for reduced motion: slower spring, gentle release. */
  setMotionScale(scale: number): void;
  /** Let go and clean up, for scene teardown mid-gesture. */
  dispose(): void;
}

/** Vertex → neighbouring vertices, once, from the same topology the tests pin. */
function buildAdjacency(egg: EggMesh): number[][] {
  const adjacency: number[][] = Array.from({ length: egg.vertexCount }, () => []);
  for (const [a, b] of edgesOf(egg).edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return adjacency;
}

export function createInteraction(
  world: TerrariumWorld,
  slime: SlimeBody,
  egg: EggMesh
): Interaction {
  const adjacency = buildAdjacency(egg);

  let state: InteractionState = 'idle';
  let motionScale = 1;

  // --- the press, shared by both gestures -----------------------------------
  const pressNdc: [number, number] = [0, 0];
  let ray: PointerRay = { origin: [0, 0, 0], dir: [0, 0, 1] };
  let hitDistance = 0;
  let pressFace = 0;
  let pressAge = 0;

  // --- the finger -----------------------------------------------------------
  let finger: TerrariumBody | null = null;

  // --- the grab -------------------------------------------------------------
  let cluster: number[] = [];
  /** Cluster shape at the moment of the grab, relative to the anchor. */
  let offsets: Float32Array = new Float32Array(0);
  const carried = { positions: new Float32Array(0) };
  const anchor: Vec = [0, 0, 0];
  const anchorVelocity: Vec = [0, 0, 0];
  const anchorTarget: Vec = [0, 0, 0];
  /** Anchor height at the moment of the grab — the lift gain's zero point. */
  let grabStartY = 0;

  function rayPoint(out: Vec, at: number): void {
    out[0] = ray.origin[0] + ray.dir[0] * at;
    out[1] = ray.origin[1] + ray.dir[1] * at;
    out[2] = ray.origin[2] + ray.dir[2] * at;
  }

  function clampToBox(point: Vec): void {
    point[0] = Math.min(
      BOX_HALF_X - GRAB_BOX_MARGIN,
      Math.max(-BOX_HALF_X + GRAB_BOX_MARGIN, point[0])
    );
    point[2] = Math.min(
      BOX_HALF_Z - GRAB_BOX_MARGIN,
      Math.max(-BOX_HALF_Z + GRAB_BOX_MARGIN, point[2])
    );
    point[1] = Math.min(
      FLOOR_Y + BOX_HEIGHT - GRAB_BOX_MARGIN,
      Math.max(FLOOR_Y + GRAB_MIN_LIFT, point[1])
    );
  }

  function beginGrab(): void {
    if (finger) {
      world.remove(finger);
      finger = null;
    }

    // The hit face's corners plus everything one edge away — a palmful of
    // surface, enough to carry the slime without tearing one vertex ahead of
    // the rest.
    const seed = [
      egg.faces[pressFace * 3],
      egg.faces[pressFace * 3 + 1],
      egg.faces[pressFace * 3 + 2]
    ];
    const chosen = new Set<number>(seed);
    for (const v of seed) for (const n of adjacency[v]) chosen.add(n);
    cluster = [...chosen];

    // Anchor starts where the surface actually is now, and the cluster keeps
    // its current shape relative to it — grabbing a dented slime carries the
    // dent, which is the honest reading.
    const positions = new Float32Array(egg.vertexCount * 3);
    world.readSlimeVertices(slime, positions);
    rayPoint(anchor, hitDistance);
    clampToBox(anchor);
    grabStartY = anchor[1];
    anchorVelocity[0] = anchorVelocity[1] = anchorVelocity[2] = 0;

    offsets = new Float32Array(cluster.length * 3);
    carried.positions = new Float32Array(cluster.length * 3);
    for (let i = 0; i < cluster.length; i++) {
      offsets[i * 3] = positions[cluster[i] * 3] - anchor[0];
      offsets[i * 3 + 1] = positions[cluster[i] * 3 + 1] - anchor[1];
      offsets[i * 3 + 2] = positions[cluster[i] * 3 + 2] - anchor[2];
    }

    world.wakeSlime(slime);
    state = 'grabbing';
  }

  function endGrab(): void {
    // Letting go is ceasing to steer — plus the throw governor. While held,
    // steering runs fast (the grip must out-pull the whole body's weight
    // through a dozen light vertices), so the instant of release could
    // carry hand-authority speed; capped, the slime leaves the hand moving
    // like a dropped pet, and under reduced motion it is set down gentler
    // still.
    world.capSlimeVertexSpeeds(slime, cluster, GRAB_THROW_SPEED * motionScale);
    cluster = [];
  }

  return {
    press(pressRay, ndc, faceIndex, distance) {
      this.release();
      ray = pressRay;
      pressNdc[0] = ndc[0];
      pressNdc[1] = ndc[1];
      hitDistance = distance;
      pressFace = faceIndex;
      pressAge = 0;

      world.wakeSlime(slime);
      // The finger's *surface* arrives at the hit point; its centre hangs a
      // radius back along the ray. Spawning the centre on the surface buries
      // half the sphere in the membrane, and contact resolution then pushes
      // vertices out around it — a finger inside the slime, not on it.
      const at: Vec = [0, 0, 0];
      rayPoint(at, hitDistance - FINGER_RADIUS);
      finger = world.addFinger(FINGER_RADIUS, at);
      state = 'poking';
    },

    move(moveRay, ndc) {
      if (state === 'idle') return;
      ray = moveRay;
      if (state === 'poking') {
        const dx = ndc[0] - pressNdc[0];
        const dy = ndc[1] - pressNdc[1];
        if (Math.hypot(dx, dy) > GRAB_NDC_THRESHOLD) beginGrab();
      }
    },

    release() {
      if (finger) {
        world.remove(finger);
        finger = null;
      }
      if (state === 'grabbing') endGrab();
      state = 'idle';
    },

    step(dt) {
      if (state === 'poking' && finger) {
        pressAge += dt;
        // The push ramps in over a quarter second and stays — a fingertip
        // easing into the surface, scaled down when motion is reduced.
        const push = FINGER_MAX_DEPTH * motionScale * Math.min(1, pressAge / FINGER_PRESS_SEC);
        const target: Vec = [0, 0, 0];
        rayPoint(target, hitDistance - FINGER_RADIUS + push);
        target[1] = Math.max(target[1], FLOOR_Y + FINGER_RADIUS * 0.45 + FINGER_FLOOR_CLEARANCE);
        world.moveKinematic(finger, target, dt);
      }

      if (state === 'grabbing') {
        rayPoint(anchorTarget, hitDistance);
        // The hand's vertical travel is amplified from the grab's starting
        // height — the camera frames the pet too tightly for a 1:1 mapping
        // to reach the top of the box. See GRAB_LIFT_GAIN.
        anchorTarget[1] = grabStartY + (anchorTarget[1] - grabStartY) * GRAB_LIFT_GAIN;
        clampToBox(anchorTarget);

        // Critically damped chase, slowed with the motion scale. Same spring
        // as the marimo's grab; a hand is a hand.
        const omega = GRAB_OMEGA * (0.4 + 0.6 * motionScale);
        for (let axis = 0; axis < 3; axis++) {
          const accel =
            (anchorTarget[axis] - anchor[axis]) * omega * omega - 2 * omega * anchorVelocity[axis];
          anchorVelocity[axis] += accel * dt;
          anchor[axis] += anchorVelocity[axis] * dt;
        }

        for (let i = 0; i < cluster.length; i++) {
          carried.positions[i * 3] = anchor[0] + offsets[i * 3];
          carried.positions[i * 3 + 1] = anchor[1] + offsets[i * 3 + 1];
          carried.positions[i * 3 + 2] = anchor[2] + offsets[i * 3 + 2];
        }
        // The grip speed scales with reduced motion the way the spring does:
        // a gentler hand all the way down, not a slower copy of a fast one.
        world.steerSlimeVertices(
          slime,
          cluster,
          carried.positions,
          dt,
          GRAB_STEER_SPEED * (0.4 + 0.6 * motionScale)
        );
      }
    },

    state() {
      return state;
    },

    setMotionScale(scale) {
      motionScale = scale;
    },

    dispose() {
      this.release();
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
