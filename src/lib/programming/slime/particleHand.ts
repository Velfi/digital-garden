import {
  BOX_HALF_X,
  BOX_HALF_Z,
  BOX_HEIGHT,
  FINGER_MAX_DEPTH,
  FINGER_PRESS_SEC,
  FLOOR_Y
} from './constants';
import type { ParticleWorld } from './pbdWorld';

/**
 * The hand, for the particle body: press on the slime to *poke* — a
 * fingertip easing into the surface — drag past a small threshold to take
 * hold and carry, release to let it slump free.
 *
 * Where the mesh era pinned vertices and steered clusters, this is nothing
 * but a moving velocity target — `pullTowards` drives the particles under
 * the grip toward the anchor's own velocity, bounded by construction, so no
 * gesture can shred or fling the body. The anchor chases the pointer with a
 * critical-damping ease (the marimo grab-spring feel), and vertical travel
 * is amplified the same way the mesh hand's was: the close camera framing
 * shrinks pointer reach, and without the gain the pet can barely be lifted.
 *
 * The poke was lost in the mesh→particle move (every press grabbed at once,
 * and the engine's `pushFrom` had no caller outside the probes — user-caught:
 * "I can't poke anymore, it just grabs"). Restored in the old finger's
 * shape: the push centre starts tangent to the hit point and eases in over
 * `FINGER_PRESS_SEC` to `FINGER_MAX_DEPTH`, pushing the whole press long, so
 * a held press holds a dent and release springs back with the jiggle.
 */

/** Grip radius, metres — a generous handful of the 4 cm body. The first
 * cut used 16 mm and lost its grip mid-lift: goo lags the anchor, and a
 * grip that only covers the anchor's own point slides off the material it
 * is meant to be holding. */
const GRIP_RADIUS = 0.026;
/** The anchor's chase rate toward the pointer, 1/s — brisk enough to feel
 * direct, slow enough that the goo can keep up with its own hand. */
const CHASE_RATE = 10;
/** Vertical pointer travel is worth this many times itself (see above). */
const LIFT_GAIN = 2.2;
/** Keep the anchor inside the box by this margin. */
const MARGIN = 0.008;
/**
 * How far the anchor may lead the material it grips, metres. The climb
 * thread's hardest-won lesson, relearned by this hand: a grip that outruns
 * its goo is commanding an empty sphere. Each step the anchor is reined
 * back to within this tether of the gripped particles' centroid, so a fast
 * gesture stretches the pull out over time instead of dropping the body.
 */
const TETHER = 0.012;
/** The fastest velocity a gesture may command of the goo, m/s. */
const HAND_SPEED_CAP = 0.6;
/** Fingertip radius for the poke's push, metres. Smaller than the grip: a
 * poke is a fingertip, a grab is a handful. */
const POKE_RADIUS = 0.014;
/** The push speed handed to `pushFrom`, m/s — the probes' proven number. */
const POKE_SPEED = 0.12;
/** How far the pressed point may wander, metres of aim travel, before the
 * press stops being a poke and becomes a grab. The mesh hand drew the same
 * line at 0.05 NDC, which is a few millimetres at the tank. */
const GRAB_DRAG_THRESHOLD = 0.003;
/** The petting stroke's contact radius, metres — between the poke's
 * fingertip and the grab's handful: the flat of a finger, not its tip. */
const PET_RADIUS = 0.02;
/** How deep a stroke presses, metres — a caress lies on the surface. */
const PET_DEPTH = 0.0045;
/** The stroke's push speed, m/s — gentler than the poke on purpose. */
const PET_SPEED = 0.07;

interface Ray {
  origin: [number, number, number];
  dir: [number, number, number];
}

export interface ParticleHand {
  state(): 'idle' | 'poking' | 'grabbing' | 'petting';
  /**
   * A press that landed on the slime, `distance` along the ray. The default
   * `'hand'` gesture pokes and, dragged, grabs; `'pet'` is a stroke — a
   * shallow, broad touch that follows the pointer and can never become a
   * grab, so no amount of enthusiasm turns affection into a carry.
   */
  press(ray: Ray, distance: number, gesture?: 'hand' | 'pet'): void;
  move(ray: Ray): void;
  release(): void;
  setMotionScale(scale: number): void;
  /** Called by the scene once per physics substep, before `world.step`. */
  step(dt: number): void;
}

export function createParticleHand(world: ParticleWorld): ParticleHand {
  let mode: 'idle' | 'poking' | 'grabbing' | 'petting' = 'idle';
  let motionScale = 1;
  /** Scratch for the tether's grip-centroid sample. */
  const sample = new Float32Array(3);
  /** The poke: the latest ray, the press's aim point, and the press age. */
  let pokeRay: Ray | null = null;
  let pressAimX = 0;
  let pressAimY = 0;
  let pressAimZ = 0;
  let pokeAge = 0;

  // Where the pointer wants the grip (raw target), and where the grip is.
  let targetX = 0;
  let targetY = 0;
  let targetZ = 0;
  let anchorX = 0;
  let anchorY = 0;
  let anchorZ = 0;
  /** The press's depth along the ray and its y, for the lift gain. */
  let grabDepth = 0;
  let grabY = 0;

  function aim(ray: Ray): void {
    const x = ray.origin[0] + ray.dir[0] * grabDepth;
    const y = ray.origin[1] + ray.dir[1] * grabDepth;
    const z = ray.origin[2] + ray.dir[2] * grabDepth;
    const lifted = grabY + (y - grabY) * LIFT_GAIN;
    targetX = Math.min(BOX_HALF_X - MARGIN, Math.max(-BOX_HALF_X + MARGIN, x));
    targetY = Math.min(FLOOR_Y + BOX_HEIGHT - MARGIN, Math.max(FLOOR_Y + 0.004, lifted));
    targetZ = Math.min(BOX_HALF_Z - MARGIN, Math.max(-BOX_HALF_Z + MARGIN, z));
  }

  return {
    state: () => mode,

    press(ray, distance, gesture = 'hand') {
      grabDepth = distance;
      grabY = ray.origin[1] + ray.dir[1] * distance;
      aim(ray);
      pokeRay = ray;
      pressAimX = ray.origin[0] + ray.dir[0] * distance;
      pressAimY = ray.origin[1] + ray.dir[1] * distance;
      pressAimZ = ray.origin[2] + ray.dir[2] * distance;
      pokeAge = 0;
      mode = gesture === 'pet' ? 'petting' : 'poking';
    },

    move(ray) {
      if (mode === 'idle') return;
      if (mode === 'petting') {
        // The stroke follows the pointer along the surface. The depth stays
        // the press's — approximate over a curved back, but the pet radius
        // is broad enough to keep contact through the slop of a caress.
        pokeRay = ray;
        return;
      }
      if (mode === 'poking') {
        pokeRay = ray;
        const dx = ray.origin[0] + ray.dir[0] * grabDepth - pressAimX;
        const dy = ray.origin[1] + ray.dir[1] * grabDepth - pressAimY;
        const dz = ray.origin[2] + ray.dir[2] * grabDepth - pressAimZ;
        if (Math.hypot(dx, dy, dz) > GRAB_DRAG_THRESHOLD) {
          // The press is travelling: it was a grab all along. The anchor
          // starts where the aim is *now*, so the hand-off cannot yank.
          aim(ray);
          anchorX = targetX;
          anchorY = targetY;
          anchorZ = targetZ;
          mode = 'grabbing';
        }
        return;
      }
      aim(ray);
    },

    release() {
      mode = 'idle';
      pokeRay = null;
    },

    setMotionScale(scale) {
      motionScale = scale;
    },

    step(dt) {
      if (mode === 'petting' && pokeRay) {
        // The caress: a broad, shallow push riding just under the surface,
        // easing in over the same ramp as the fingertip but stopping at a
        // fraction of its depth. It moves with the pointer, so a stroke
        // reads as a travelling shiver rather than a dent.
        pokeAge += dt;
        const depth =
          grabDepth - PET_RADIUS + Math.min(1, pokeAge / FINGER_PRESS_SEC) * PET_DEPTH * motionScale;
        const x = pokeRay.origin[0] + pokeRay.dir[0] * depth;
        const y = Math.max(FLOOR_Y + 0.002, pokeRay.origin[1] + pokeRay.dir[1] * depth);
        const z = pokeRay.origin[2] + pokeRay.dir[2] * depth;
        world.pushFrom(x, y, z, PET_RADIUS, PET_SPEED * motionScale);
        return;
      }
      if (mode === 'poking' && pokeRay) {
        // The fingertip: tangent to the surface at press, easing in along
        // the ray. Push the whole press long — that is what holds the dent
        // against the orb's spring-back; release stops it and the body
        // jiggles home.
        pokeAge += dt;
        const depth =
          grabDepth -
          POKE_RADIUS +
          Math.min(1, pokeAge / FINGER_PRESS_SEC) * FINGER_MAX_DEPTH * motionScale;
        const x = pokeRay.origin[0] + pokeRay.dir[0] * depth;
        const y = Math.max(FLOOR_Y + 0.002, pokeRay.origin[1] + pokeRay.dir[1] * depth);
        const z = pokeRay.origin[2] + pokeRay.dir[2] * depth;
        world.pushFrom(x, y, z, POKE_RADIUS, POKE_SPEED * motionScale);
        return;
      }
      if (mode !== 'grabbing') return;
      // Critically-damped-ish chase; its velocity is the velocity the grip
      // hands the particles, so the goo swings with the gesture instead of
      // teleporting under it. Capped: no gesture may command goo to sprint.
      const ease = Math.min(1, CHASE_RATE * motionScale * dt);
      let vxTarget = ((targetX - anchorX) * ease) / dt;
      let vyTarget = ((targetY - anchorY) * ease) / dt;
      let vzTarget = ((targetZ - anchorZ) * ease) / dt;
      const speed = Math.hypot(vxTarget, vyTarget, vzTarget);
      if (speed > HAND_SPEED_CAP) {
        const k = HAND_SPEED_CAP / speed;
        vxTarget *= k;
        vyTarget *= k;
        vzTarget *= k;
      }
      anchorX += vxTarget * dt;
      anchorY += vyTarget * dt;
      anchorZ += vzTarget * dt;
      // The tether reins the *pull centre* back onto the material actually
      // held — but the commanded velocity stays the chase toward the
      // pointer. Decoupled on purpose: reining the velocity too re-creates
      // the climb thread's regrip deadlock (a parked anchor commands
      // nothing, and the body hangs forever at the tether's length). This
      // way a fast gesture becomes a sustained tow at the goo's own pace.
      const held = world.sampleAround(anchorX, anchorY, anchorZ, GRIP_RADIUS, sample);
      if (held > 0) {
        const dx = anchorX - sample[0];
        const dy = anchorY - sample[1];
        const dz = anchorZ - sample[2];
        const dist = Math.hypot(dx, dy, dz);
        if (dist > TETHER) {
          const pull = TETHER / dist;
          anchorX = sample[0] + dx * pull;
          anchorY = sample[1] + dy * pull;
          anchorZ = sample[2] + dz * pull;
        }
      }
      world.pullTowards(
        anchorX,
        anchorY,
        anchorZ,
        GRIP_RADIUS,
        vxTarget,
        vyTarget,
        vzTarget,
        motionScale
      );
    }
  };
}

// Physics-adjacent module: no hot-swap (see pbdWorld.ts).
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
