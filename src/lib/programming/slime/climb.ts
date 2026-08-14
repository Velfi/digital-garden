import {
  BOX_HALF_X,
  BOX_HALF_Z,
  BOX_HEIGHT,
  CLIMB_ANCHOR_SPEED,
  CLIMB_ASCEND_GIVE_UP_SEC,
  CLIMB_GRIP_RADIUS,
  CLIMB_IDLE_MAX_SEC,
  CLIMB_IDLE_MIN_SEC,
  CLIMB_LAG_PAUSE,
  CLIMB_MAX_HEIGHT_FRAC,
  CLIMB_MIN_MOISTURE,
  CLIMB_REGRIP_SEC,
  CLIMB_START_V,
  CLIMB_STEER_SPEED,
  CLIMB_WALL_PRESS,
  FLOOR_Y
} from './constants';
import { mulberry32 } from '../marimo/rng';
import { PANE_XN, PANE_XP, PANE_ZN, PANE_ZP, paneWorld } from './grimeMap';
import type { EggMesh } from './eggMesh';
import type { SlimeBody, TerrariumWorld } from './joltWorld';

/**
 * The will: what the slime does when nobody is touching it.
 *
 * The hand (`interaction.ts`) proved out a way to move a soft body that
 * cannot explode: steer a cluster of surface vertices toward targets hung
 * off a slowly-moving anchor, with real masses, capped speeds, and release
 * as nothing but ceasing to steer. The will is the same machinery pointed
 * inward — an invisible grip the pet applies to *itself*. Ambling is the
 * grip dragging the body's crown across the floor; climbing is the grip
 * walking up a pane while pressing the body against it (the steer clamp in
 * `steerSlimeVertices` stops the pressed targets at the glass, which is what
 * flattens the flank against it — adhesion as theatre). Every second or so
 * the grip lets go and re-seeds from whatever vertices are now nearest the
 * anchor: the inchworm rhythm, and also what makes the scheme unlosable —
 * a grip that slipped simply re-grips where the body actually is.
 *
 * Split in two so the mind is testable without WASM: `createClimbPlanner`
 * is a pure seeded state machine from inputs to an anchor-and-intent, and
 * `createClimb` is the thin driver that turns intent into steered vertices.
 */

export type ClimbMode = 'idle' | 'amble' | 'ascend' | 'dwell' | 'descend' | 'settle';

export interface ClimbInputs {
  /** Where the body actually is (its vertex centroid), world metres. */
  center: readonly [number, number, number];
  /** True while the hand is pressing or carrying — the will yields instantly. */
  handBusy: boolean;
  /** 0..1 appetite for wandering; 0 freezes the will (dormant, waking, eating). */
  zest: number;
  moisture: number;
  /** Motion scale, 0..1 — reduced motion wanders at a crawl. */
  speed: number;
  /**
   * A settled flake worth eating, world metres, or null. Food outranks
   * wanderlust: it interrupts idling, retargets an amble, and calls the pet
   * down off the glass. The scene only offers it while the pet is actually
   * hungry — a full slime is shown nothing and is enticed by nothing.
   */
  food: readonly [number, number, number] | null;
}

/** What the planner wants done this step. */
export interface ClimbDrive {
  mode: ClimbMode;
  /** Steer only while true; false is a resting or released will. */
  active: boolean;
  anchor: readonly [number, number, number];
  /** The pane being climbed, or null on the floor. */
  pane: number | null;
}

export interface ClimbPlanner {
  step(dt: number, inputs: ClimbInputs): ClimbDrive;
  mode(): ClimbMode;
}

/** How long the will rests after any trip, drop, or interruption. */
const SETTLE_SEC = 2;
/** How the pane lottery weighs its choices: the front is where the show is. */
const PANE_WEIGHTS: ReadonlyArray<readonly [number, number]> = [
  [PANE_ZP, 0.45],
  [PANE_XP, 0.2],
  [PANE_XN, 0.2],
  [PANE_ZN, 0.15]
];
/** Odds that a stroll heads for glass rather than moss, given enough moisture. */
const WALL_TRIP_CHANCE = 0.55;
/** Odds that a climb ends by simply letting go. A slime is not graceful. */
const DROP_CHANCE = 0.12;
/** The anchor has arrived when it is this close to its waypoint, metres. */
const ARRIVE_DIST = 0.004;
/** A body this far from the anchor has been carried off — the will lets go. */
const LOST_DIST = 0.05;
/** Keep ambles and wall picks off the corners, metres and uv margin. */
const FLOOR_MARGIN = 0.02;
const PANE_U_MARGIN = 0.22;

export function createClimbPlanner(seed: number): ClimbPlanner {
  const rand = mulberry32((seed ^ 0x5e17c11b) >>> 0);

  let mode: ClimbMode = 'idle';
  let timer = CLIMB_IDLE_MIN_SEC + rand() * (CLIMB_IDLE_MAX_SEC - CLIMB_IDLE_MIN_SEC);
  const anchor: [number, number, number] = [0, FLOOR_Y, 0];

  // The trip on the books: a floor waypoint, and optionally a pane to scale.
  let pane: number | null = null;
  let paneU = 0.5;
  let paneV = 0;
  let targetV = 0;
  let floorTarget: [number, number] = [0, 0];
  /** Phase for the lateral meander while climbing. */
  let sway = 0;
  /** How long the current ascent has been at it, seconds. */
  let ascendFor = 0;
  /** The current amble is a food run, retargeted live off `inputs.food`. */
  let foraging = false;

  function idleAgain(afterSec: number): void {
    mode = afterSec > 0 ? 'settle' : 'idle';
    timer =
      afterSec > 0
        ? afterSec
        : CLIMB_IDLE_MIN_SEC + rand() * (CLIMB_IDLE_MAX_SEC - CLIMB_IDLE_MIN_SEC);
    pane = null;
    foraging = false;
  }

  /** Head for the food. Callable from idle or mid-amble; food wins. */
  function forageTo(inputs: ClimbInputs, food: readonly [number, number, number]): void {
    floorTarget = [
      Math.min(BOX_HALF_X - FLOOR_MARGIN, Math.max(-(BOX_HALF_X - FLOOR_MARGIN), food[0])),
      Math.min(BOX_HALF_Z - FLOOR_MARGIN, Math.max(-(BOX_HALF_Z - FLOOR_MARGIN), food[2]))
    ];
    if (mode !== 'amble') {
      anchor[0] = inputs.center[0];
      anchor[1] = inputs.center[1] + 0.006;
      anchor[2] = inputs.center[2];
    }
    pane = null;
    foraging = true;
    mode = 'amble';
  }

  function planTrip(inputs: ClimbInputs): void {
    const wantsWall = inputs.moisture >= CLIMB_MIN_MOISTURE && rand() < WALL_TRIP_CHANCE;
    if (wantsWall) {
      let roll = rand();
      pane = PANE_WEIGHTS[PANE_WEIGHTS.length - 1][0];
      for (const [candidate, weight] of PANE_WEIGHTS) {
        if (roll < weight) {
          pane = candidate;
          break;
        }
        roll -= weight;
      }
      paneU = PANE_U_MARGIN + rand() * (1 - 2 * PANE_U_MARGIN);
      // How high it dares: moisture is grip, so a damper slime climbs higher.
      const gripFrac = Math.min(1, inputs.moisture * 1.2);
      targetV = (0.3 + rand() * 0.45) * CLIMB_MAX_HEIGHT_FRAC * gripFrac;
      const base = paneWorld(pane, paneU, 0);
      floorTarget = [base[0], base[2]];
    } else {
      pane = null;
      floorTarget = [
        (rand() * 2 - 1) * (BOX_HALF_X - FLOOR_MARGIN),
        (rand() * 2 - 1) * (BOX_HALF_Z - FLOOR_MARGIN)
      ];
    }
    // The grip rides the body's crown while it drags itself along the floor.
    anchor[0] = inputs.center[0];
    anchor[1] = inputs.center[1] + 0.006;
    anchor[2] = inputs.center[2];
    mode = 'amble';
  }

  /** Move the anchor toward a point at amble speed; true on arrival. */
  function advance(dt: number, speed: number, tx: number, ty: number, tz: number): boolean {
    const dx = tx - anchor[0];
    const dy = ty - anchor[1];
    const dz = tz - anchor[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist < ARRIVE_DIST) return true;
    const step = Math.min(dist, CLIMB_ANCHOR_SPEED * speed * dt);
    anchor[0] += (dx / dist) * step;
    anchor[1] += (dy / dist) * step;
    anchor[2] += (dz / dist) * step;
    return false;
  }

  return {
    step(dt, inputs) {
      const steering =
        mode === 'amble' || mode === 'ascend' || mode === 'dwell' || mode === 'descend';

      // The will yields to the hand, to dormancy, and to a body that is
      // simply not where it left it (carried off mid-trip, or rebuilt by
      // the watchdog). Yielding is release: no steering, settle, re-plan.
      if (steering) {
        const lost =
          Math.hypot(
            inputs.center[0] - anchor[0],
            inputs.center[1] - anchor[1],
            inputs.center[2] - anchor[2]
          ) > LOST_DIST;
        if (inputs.handBusy || inputs.zest <= 0 || lost) idleAgain(SETTLE_SEC);
      }

      // Food outranks wanderlust. A hungry slime abandons idling for the
      // flake at once, bends a stroll toward it, and comes down off the
      // glass for it; the scene never offers food to a full slime.
      const mayAct = !inputs.handBusy && inputs.zest > 0;
      if (mayAct && inputs.food) {
        if (mode === 'idle' || (mode === 'amble' && !foraging)) {
          forageTo(inputs, inputs.food);
        } else if (mode === 'ascend' || mode === 'dwell') {
          mode = 'descend';
        }
      }

      switch (mode) {
        case 'idle':
          // The idle clock only runs while a trip could actually start —
          // pausing it under a pressing hand keeps the pet from bolting the
          // moment it is let go.
          if (!inputs.handBusy && inputs.zest > 0) {
            timer -= dt * (0.4 + 0.6 * inputs.zest);
            if (timer <= 0) planTrip(inputs);
          }
          break;

        case 'amble': {
          if (foraging) {
            if (inputs.food) {
              // The flake can get nudged; the trip follows it.
              forageTo(inputs, inputs.food);
            } else {
              // Eaten, moldy, or appetite gone — the errand is over.
              idleAgain(SETTLE_SEC);
              break;
            }
          }
          // The grip rides at crown height — fixed, not chasing the body's
          // centroid, so the anchor's height cannot feed back on itself.
          const arrived = advance(
            dt,
            inputs.speed,
            floorTarget[0],
            FLOOR_Y + 0.018,
            floorTarget[1]
          );
          if (arrived) {
            if (pane === null) {
              idleAgain(SETTLE_SEC);
            } else {
              // The ascent grips at crown height and pulls *up* from there —
              // the hand's proven lift, walked up the pane. Starting the
              // anchor at the pane's base gripped the low flank instead, and
              // the integration test watched that grip lose to the leverage
              // of everything above it.
              paneV = CLIMB_START_V;
              sway = 0;
              ascendFor = 0;
              mode = 'ascend';
            }
          }
          break;
        }

        case 'ascend': {
          sway += dt;
          ascendFor += dt;
          // Inchworm feedback: the anchor only advances while the body is
          // keeping up. Without this the anchor simply escapes its own grip
          // (there is no human on this hand to notice the pet slipping).
          const lag = anchor[1] - inputs.center[1];
          if (lag < CLIMB_LAG_PAUSE) {
            paneV = Math.min(
              targetV,
              paneV + (CLIMB_ANCHOR_SPEED * inputs.speed * dt) / BOX_HEIGHT
            );
          }
          const u = paneU + Math.sin(sway * 0.7) * 0.05;
          const at = paneWorld(pane!, u, paneV);
          anchor[0] = at[0];
          anchor[1] = at[1];
          anchor[2] = at[2];
          if (paneV >= targetV) {
            mode = 'dwell';
            timer = 2.5 + rand() * 5;
          } else if (ascendFor > CLIMB_ASCEND_GIVE_UP_SEC) {
            // Too dry, too tired, too heavy — whatever it was, come down.
            mode = 'descend';
          }
          break;
        }

        case 'dwell': {
          sway += dt;
          const at = paneWorld(pane!, paneU + Math.sin(sway * 0.7) * 0.05, paneV);
          anchor[0] = at[0];
          anchor[1] = at[1];
          anchor[2] = at[2];
          timer -= dt;
          if (timer <= 0) {
            if (rand() < DROP_CHANCE && inputs.speed > 0.5) {
              // Let go and plop. The body is built for worse.
              idleAgain(SETTLE_SEC);
            } else {
              mode = 'descend';
            }
          }
          break;
        }

        case 'descend': {
          sway += dt;
          // Down to crown height, then let go — the body is already resting
          // by then, and release from a low grip is a settle, not a fall.
          const floorV = CLIMB_START_V * 0.85;
          paneV = Math.max(floorV, paneV - (CLIMB_ANCHOR_SPEED * inputs.speed * dt) / BOX_HEIGHT);
          const at = paneWorld(pane!, paneU + Math.sin(sway * 0.7) * 0.05, paneV);
          anchor[0] = at[0];
          anchor[1] = at[1];
          anchor[2] = at[2];
          if (paneV <= floorV) idleAgain(SETTLE_SEC);
          break;
        }

        case 'settle':
          timer -= dt;
          if (timer <= 0) idleAgain(0);
          break;
      }

      const active =
        mode === 'amble' || mode === 'ascend' || mode === 'dwell' || mode === 'descend';
      return {
        mode,
        active,
        anchor,
        pane: mode === 'ascend' || mode === 'dwell' || mode === 'descend' ? pane : null
      };
    },

    mode() {
      return mode;
    }
  };
}

// ---------------------------------------------------------------- driver

export interface Climb {
  /** Advance the will. Call once per fixed step, before the world steps. */
  step(dt: number, inputs: ClimbInputs): ClimbDrive;
  /** The pane currently being climbed, for anyone who asks. */
  pane(): number | null;
  dispose(): void;
}

/** Outward normal per pane — the direction that presses a target *into* it. */
function paneOutward(pane: number): [number, number, number] {
  switch (pane) {
    case PANE_XP:
      return [1, 0, 0];
    case PANE_XN:
      return [-1, 0, 0];
    case PANE_ZP:
      return [0, 0, 1];
    default:
      return [0, 0, -1];
  }
}

export function createClimb(
  world: TerrariumWorld,
  slime: SlimeBody,
  egg: EggMesh,
  seed: number
): Climb {
  return createClimbWithPlanner(world, slime, egg, createClimbPlanner(seed));
}

/** Seam for the tests, which hand in a planner they can also interrogate. */
export function createClimbWithPlanner(
  world: TerrariumWorld,
  slime: SlimeBody,
  egg: EggMesh,
  planner: ClimbPlanner
): Climb {
  const positions = new Float32Array(egg.vertexCount * 3);
  let cluster: number[] = [];
  const offsets: number[] = [];
  const targets = { positions: new Float32Array(0) };
  let regripTimer = 0;
  let wasActive = false;
  let currentPane: number | null = null;
  /** The pane the current grip was seeded for. */
  let grippedPane: number | null = null;

  /** Seed the grip from whatever vertices are nearest the anchor now. */
  function regrip(anchor: readonly [number, number, number]): void {
    world.readSlimeVertices(slime, positions);
    cluster = [];
    offsets.length = 0;
    const radiusSq = CLIMB_GRIP_RADIUS * CLIMB_GRIP_RADIUS;
    for (let i = 0; i < egg.vertexCount; i++) {
      const dx = positions[i * 3] - anchor[0];
      const dy = positions[i * 3 + 1] - anchor[1];
      const dz = positions[i * 3 + 2] - anchor[2];
      if (dx * dx + dy * dy + dz * dz > radiusSq) continue;
      cluster.push(i);
      offsets.push(dx, dy, dz);
    }
    // An anchor that has wandered clear of the body grips nothing; the next
    // step re-seeds, and the planner's lost-body check ends trips whose
    // anchor truly escaped.
    targets.positions = new Float32Array(cluster.length * 3);
    regripTimer = CLIMB_REGRIP_SEC;
  }

  return {
    step(dt, inputs) {
      const drive = planner.step(dt, inputs);
      currentPane = drive.pane;

      if (!drive.active) {
        // Release is ceasing to steer — the hand's rule, and the will's.
        cluster = [];
        wasActive = false;
        grippedPane = null;
        return drive;
      }

      if (!wasActive) {
        regrip(drive.anchor);
        wasActive = true;
        world.wakeSlime(slime);
      }

      // On the floor the grip re-seeds on a cadence: the body slides, and a
      // stale grip drags a smaller and smaller patch. On glass it must NOT —
      // steering force is `tracking error / dt`, and rebaselining the
      // offsets every second erases the very error that lifts the body (the
      // integration test caught the lag gate and the regrip deadlocked: the
      // gate parked the anchor, the regrip zeroed the pull, and the pet
      // stood on the moss under an anchor going nowhere). One grip per
      // ascent, like one grip per grab; mode and pane changes re-seed it.
      regripTimer -= dt;
      const onGlass = drive.pane !== null;
      if (drive.pane !== grippedPane) {
        regrip(drive.anchor);
        grippedPane = drive.pane;
      } else if ((regripTimer <= 0 && !onGlass) || cluster.length < 4) {
        regrip(drive.anchor);
      }
      if (cluster.length === 0) return drive;

      // While on glass, the grip presses its targets a little *into* the
      // pane; the box clamp in the steer stops them at the glass, and the
      // flank flattens against it.
      let pressX = 0;
      let pressY = 0;
      let pressZ = 0;
      if (drive.pane !== null) {
        const [nx, ny, nz] = paneOutward(drive.pane);
        pressX = nx * CLIMB_WALL_PRESS;
        pressY = ny * CLIMB_WALL_PRESS;
        pressZ = nz * CLIMB_WALL_PRESS;
      }
      for (let i = 0; i < cluster.length; i++) {
        targets.positions[i * 3] = drive.anchor[0] + offsets[i * 3] + pressX;
        targets.positions[i * 3 + 1] = drive.anchor[1] + offsets[i * 3 + 1] + pressY;
        targets.positions[i * 3 + 2] = drive.anchor[2] + offsets[i * 3 + 2] + pressZ;
      }
      world.steerSlimeVertices(
        slime,
        cluster,
        targets.positions,
        dt,
        CLIMB_STEER_SPEED * (0.4 + 0.6 * inputs.speed)
      );
      return drive;
    },

    pane() {
      return currentPane;
    },

    dispose() {
      cluster = [];
    }
  };
}
