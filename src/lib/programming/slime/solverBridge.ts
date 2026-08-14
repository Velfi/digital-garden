import { buildSeedPositions, type SolverRock } from './pbdWorld';
import type {
  BallPose,
  HandGesture,
  HandState,
  MainToSolver,
  SolverRay,
  SolverToMain
} from './solverProtocol';

/**
 * The scene's handle on the solver worker — the main-thread half of
 * `slimeSolver.worker.ts`.
 *
 * It keeps the vocabulary the scene already spoke when the solver lived in
 * the render loop (`setLure`, `setTuning`, the hand's press/move/release),
 * so the move off-thread is a change of address, not of grammar. What used
 * to be `step()` is gone: the worker keeps its own 120 Hz clock, and the
 * scene just reads the freshest positions each frame.
 *
 * Honesty at the seams:
 * - `readPositions` serves the latest snapshot the worker has posted.
 *   Between spawn and the worker's first word it serves the deterministic
 *   seed lattice — the same positions the solver itself starts from, so
 *   the first frames render the true newborn body, not zeros at origin.
 * - `hand.state()` is the state as of the last snapshot, one message behind
 *   the worker's truth. Every consumer (poke bookkeeping, the will's
 *   hand-outranks check, the UI chip) reads it per frame and tolerates a
 *   frame of lag by construction.
 * - Commands sent before the worker boots are queued and flushed in order.
 *
 * Snapshot buffers are recycled: each received buffer is posted back to the
 * worker's pool once the next one supersedes it.
 */

export interface SolverBridge {
  readonly particleCount: number;
  /** Bring the body into being (idempotent), serving seed positions until
   * the worker's first snapshot lands. */
  spawn(): void;
  despawn(): void;
  /** Copy the freshest particle positions (xyz per particle) into `out`. */
  readPositions(out: Float32Array): void;
  setLure(x: number, z: number, urgency: number): void;
  clearLure(): void;
  /** Aim the feeding pseudopod at a world point (see `ParticleWorld.setTendril`). */
  setTendril(x: number, y: number, z: number, strength: number): void;
  clearTendril(): void;
  /** One short excited hop (see `ParticleWorld.hop`) — fizzles if airborne. */
  hop(upSpeed: number, driftX: number, driftZ: number): void;
  /** The tank's rock colliders — set once from the tank seed; empty clears. */
  setRocks(rocks: readonly SolverRock[]): void;
  /** Drop (or, with a velocity, throw) the play ball / put it away. */
  setBall(
    x: number,
    y: number,
    z: number,
    radius: number,
    vx?: number,
    vy?: number,
    vz?: number
  ): void;
  clearBall(): void;
  /** Boot the ball with an extra velocity — the click-bounce. */
  kickBall(vx: number, vy: number, vz: number): void;
  /** The ball's pose as of the last snapshot, null while it is put away. */
  ballPose(): BallPose | null;
  setTuning(viscosity: number, pressure: number, shape: number): void;
  setMaterialScale(stiffness: number, memory: number, tone: number): void;
  hand: {
    press(ray: SolverRay, distance: number, gesture?: HandGesture): void;
    move(ray: SolverRay): void;
    release(): void;
    state(): HandState;
    setMotionScale(scale: number): void;
  };
  /** Terminate the worker. The bridge is dead afterwards. */
  dispose(): void;
}

export function createSolverBridge(): SolverBridge {
  const seed = buildSeedPositions();
  const particleCount = seed.length / 3;

  const worker = new Worker(new URL('./slimeSolver.worker.ts', import.meta.url), {
    type: 'module'
  });

  let ready = false;
  const preReadyQueue: MainToSolver[] = [];
  const send = (message: MainToSolver): void => {
    if (ready) worker.postMessage(message);
    else preReadyQueue.push(message);
  };

  /** The freshest positions; starts as (and resets to) the seed lattice. */
  let latest: Float32Array = seed.slice();
  /** Whether `latest` is a worker buffer that should be recycled. */
  let latestIsPooled = false;
  let handState: HandState = 'idle';
  /** The play ball's last-snapshot pose; primed optimistically on setBall so
   * the toy renders somewhere honest before the worker's first word. */
  let ball: BallPose | null = null;
  /** Bumped at every spawn *and* despawn, so a snapshot in flight across
   * either transition is recognisably stale (see protocol). */
  let generation = 0;

  /** Send a spent worker buffer home to the pool. */
  const recycle = (buffer: ArrayBufferLike): void => {
    worker.postMessage({ type: 'buffer', buffer: buffer as ArrayBuffer } satisfies MainToSolver, [
      buffer as ArrayBuffer
    ]);
  };

  worker.onmessage = (event: MessageEvent<SolverToMain>) => {
    const msg = event.data;
    if (msg.type === 'ready') {
      ready = true;
      for (const queued of preReadyQueue) worker.postMessage(queued);
      preReadyQueue.length = 0;
      return;
    }
    // A ghost of a dead body: its buffer goes home, its contents do not.
    if (msg.generation !== generation) {
      recycle(msg.buffer);
      return;
    }
    // snapshot: adopt the new buffer, send the old one home.
    if (latestIsPooled) recycle(latest.buffer);
    latest = new Float32Array(msg.buffer);
    latestIsPooled = true;
    handState = msg.handState;
    ball = msg.ball;
  };

  return {
    particleCount,

    spawn() {
      generation += 1;
      send({ type: 'spawn', generation });
      // Serve the newborn lattice until the worker speaks; a stale pooled
      // buffer from a previous body goes home rather than lingering.
      if (latestIsPooled) recycle(latest.buffer);
      latest = seed.slice();
      latestIsPooled = false;
      handState = 'idle';
    },
    despawn() {
      generation += 1;
      send({ type: 'despawn' });
      handState = 'idle';
    },
    readPositions(out) {
      out.set(latest);
    },
    setLure(x, z, urgency) {
      send({ type: 'lure', x, z, urgency });
    },
    clearLure() {
      send({ type: 'clearLure' });
    },
    setTendril(x, y, z, strength) {
      send({ type: 'tendril', x, y, z, strength });
    },
    clearTendril() {
      send({ type: 'clearTendril' });
    },
    hop(upSpeed, driftX, driftZ) {
      send({ type: 'hop', upSpeed, driftX, driftZ });
    },
    setRocks(rocks) {
      send({ type: 'rocks', rocks: [...rocks] });
    },
    setBall(x, y, z, radius, vx = 0, vy = 0, vz = 0) {
      ball = [x, y, z, 0, 0, 0, 1];
      send({ type: 'ball', x, y, z, radius, vx, vy, vz });
    },
    clearBall() {
      ball = null;
      send({ type: 'clearBall' });
    },
    kickBall(vx, vy, vz) {
      send({ type: 'kickBall', vx, vy, vz });
    },
    ballPose() {
      return ball;
    },
    setTuning(viscosity, pressure, shape) {
      send({ type: 'tuning', viscosity, pressure, shape });
    },
    setMaterialScale(stiffness, memory, tone) {
      send({ type: 'material', stiffness, memory, tone });
    },
    hand: {
      press(ray, distance, gesture = 'hand') {
        send({ type: 'press', ray, distance, gesture });
      },
      move(ray) {
        send({ type: 'move', ray });
      },
      release() {
        send({ type: 'release' });
      },
      state() {
        return handState;
      },
      setMotionScale(scale) {
        send({ type: 'motionScale', value: scale });
      }
    },
    dispose() {
      worker.terminate();
    }
  };
}

// Same no-hot-swap rule as the physics modules: a stale scene holding an old
// bridge (and its worker) renders ghosts.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot?.invalidate();
  });
}
