import { MAX_SIM_SUBSTEPS, SIM_STEP_SEC } from './constants';
import { createParticleHand, type ParticleHand } from './particleHand';
import { createPbdWorld, type ParticleWorld, type SolverRock } from './pbdWorld';
import type { BallPose, MainToSolver, SolverToMain } from './solverProtocol';

/**
 * The solver's own thread. `pbdWorld` and `particleHand` run here verbatim — pure
 * typed-array modules with no DOM in them — behind the same fixed-step
 * accumulator doctrine the scene used to run on the main thread: 120 Hz
 * substeps, a small catch-up cap, backlog beyond it dropped. The point of
 * the move is that a render hiccup and a physics substep can no longer
 * steal each other's deadline; the goo keeps its own time.
 *
 * The clock is a self-rescheduling short timeout rather than a message from
 * the render loop — frames may stall or stop (hidden tab), and the sim
 * neither cares nor catches up beyond its cap.
 *
 * Positions travel to the scene as transferred ArrayBuffers from a small
 * pool; the scene posts each buffer back once copied out. If the pool runs
 * dry — the main thread is busy — snapshots are simply skipped: the sim
 * never blocks on the renderer.
 */

/** Buffers in flight between the threads. Three is plenty: one being
 * written, one in transit, one being read. */
const POOL_SIZE = 3;
/** The clock's tick request, ms. The browser clamps nested timeouts to ~4 ms,
 * which still leaves headroom over the 8.3 ms sim step. */
const TICK_MS = 3;

const post = (message: SolverToMain, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(message, transfer ?? []);

let world: ParticleWorld | null = null;
let hand: ParticleHand | null = null;
/** The tank's rocks, remembered across respawns (they are furniture, not pet). */
let rocks: SolverRock[] | null = null;
/** The play ball, likewise remembered — a toy left out survives a respawn. */
let ball: { x: number; y: number; z: number; radius: number } | null = null;
const ballScratch = new Float32Array(7);
let pool: ArrayBuffer[] = [];
let motionScale = 1;
let lastNowMs = 0;
let accumulatorSec = 0;
/** The living body's generation, stamped onto every snapshot (see protocol). */
let generation = 0;

self.onmessage = (event: MessageEvent<MainToSolver>) => {
  const msg = event.data;
  switch (msg.type) {
    case 'spawn': {
      generation = msg.generation;
      if (world) break;
      world = createPbdWorld();
      hand = createParticleHand(world);
      hand.setMotionScale(motionScale);
      if (rocks) world.setRocks(rocks);
      if (ball) world.setBall(ball.x, ball.y, ball.z, ball.radius);
      pool = [];
      for (let i = 0; i < POOL_SIZE; i++) {
        pool.push(new ArrayBuffer(world.particleCount * 3 * 4));
      }
      lastNowMs = 0;
      accumulatorSec = 0;
      break;
    }
    case 'despawn':
      world = null;
      hand = null;
      pool = [];
      break;
    case 'press':
      hand?.press(msg.ray, msg.distance, msg.gesture);
      break;
    case 'move':
      hand?.move(msg.ray);
      break;
    case 'release':
      hand?.release();
      break;
    case 'lure':
      world?.setLure(msg.x, msg.z, msg.urgency);
      break;
    case 'clearLure':
      world?.clearLure();
      break;
    case 'tendril':
      world?.setTendril(msg.x, msg.y, msg.z, msg.strength);
      break;
    case 'clearTendril':
      world?.clearTendril();
      break;
    case 'hop':
      world?.hop(msg.upSpeed, msg.driftX, msg.driftZ);
      break;
    case 'rocks':
      rocks = msg.rocks;
      world?.setRocks(msg.rocks);
      break;
    case 'ball':
      ball = msg;
      world?.setBall(msg.x, msg.y, msg.z, msg.radius, msg.vx, msg.vy, msg.vz);
      break;
    case 'clearBall':
      ball = null;
      world?.clearBall();
      break;
    case 'kickBall':
      world?.kickBall(msg.vx, msg.vy, msg.vz);
      break;
    case 'tuning':
      world?.setTuning(msg.viscosity, msg.pressure, msg.shape);
      break;
    case 'material':
      world?.setMaterialScale(msg.stiffness, msg.memory, msg.tone);
      break;
    case 'motionScale':
      motionScale = msg.value;
      hand?.setMotionScale(msg.value);
      break;
    case 'buffer':
      // Spent buffers only rejoin a pool that is short of its size — a
      // straggler from before a respawn must not grow the pool for good.
      if (
        world &&
        pool.length < POOL_SIZE &&
        msg.buffer.byteLength === world.particleCount * 3 * 4
      ) {
        pool.push(msg.buffer);
      }
      break;
  }
};

function tick(): void {
  setTimeout(tick, TICK_MS);
  if (!world || !hand) {
    lastNowMs = 0;
    return;
  }
  const nowMs = performance.now();
  if (lastNowMs === 0) lastNowMs = nowMs;
  // Same accumulator as the scene's: the whole backlog budget is the substep
  // cap, and anything beyond it is dropped — slow motion, never a spiral.
  accumulatorSec = Math.min(
    accumulatorSec + (nowMs - lastNowMs) / 1000,
    MAX_SIM_SUBSTEPS * SIM_STEP_SEC
  );
  lastNowMs = nowMs;
  let substeps = 0;
  while (accumulatorSec >= SIM_STEP_SEC && substeps < MAX_SIM_SUBSTEPS) {
    // The hand first, so every steering velocity is in place for the step
    // it steers — the ordering the scene's loop always kept.
    hand.step(SIM_STEP_SEC);
    world.step(SIM_STEP_SEC);
    accumulatorSec -= SIM_STEP_SEC;
    substeps += 1;
  }
  if (substeps > 0) {
    const buffer = pool.pop();
    if (buffer) {
      world.readPositions(new Float32Array(buffer));
      const ballPose = world.readBall(ballScratch)
        ? (Array.from(ballScratch) as BallPose)
        : null;
      post({ type: 'snapshot', buffer, handState: hand.state(), generation, ball: ballPose }, [
        buffer
      ]);
    }
  }
}

setTimeout(tick, TICK_MS);
post({ type: 'ready' });
