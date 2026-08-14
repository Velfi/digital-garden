/**
 * The message vocabulary between the scene and the solver worker.
 *
 * One file, imported by both sides, so the two ends of the wire cannot
 * drift apart silently. The commands mirror the `ParticleWorld` + `ParticleHand`
 * surface the scene already spoke; the only genuinely new words are the
 * buffer plumbing: `snapshot` carries particle positions main-ward as a
 * *transferred* ArrayBuffer (zero copy), and `buffer` carries the spent
 * buffer back for reuse — a small pool circulating between threads instead
 * of a megabyte of garbage per second.
 */

import type { SolverRock } from './pbdWorld';

export interface SolverRay {
  origin: [number, number, number];
  dir: [number, number, number];
}

export type HandState = 'idle' | 'poking' | 'grabbing' | 'petting';

/** What the press means: the hand grabs and pokes; the pet gesture strokes. */
export type HandGesture = 'hand' | 'pet';

export type MainToSolver =
  | { type: 'spawn'; generation: number }
  | { type: 'despawn' }
  | { type: 'press'; ray: SolverRay; distance: number; gesture: HandGesture }
  | { type: 'move'; ray: SolverRay }
  | { type: 'release' }
  | { type: 'lure'; x: number; z: number; urgency: number }
  | { type: 'clearLure' }
  | { type: 'tendril'; x: number; y: number; z: number; strength: number }
  | { type: 'clearTendril' }
  | { type: 'hop'; upSpeed: number; driftX: number; driftZ: number }
  | { type: 'rocks'; rocks: SolverRock[] }
  | {
      type: 'ball';
      x: number;
      y: number;
      z: number;
      radius: number;
      /** Launch velocity — zero for a plain drop, a flick for a throw. */
      vx: number;
      vy: number;
      vz: number;
    }
  | { type: 'clearBall' }
  | { type: 'kickBall'; vx: number; vy: number; vz: number }
  | { type: 'tuning'; viscosity: number; pressure: number; shape: number }
  | { type: 'material'; stiffness: number; memory: number; tone: number }
  | { type: 'motionScale'; value: number }
  | { type: 'buffer'; buffer: ArrayBuffer };

/**
 * Snapshots are stamped with the body's `generation` (assigned by the
 * bridge at each spawn) so one still in flight across a despawn/respawn is
 * recognisably from the dead body and dropped, instead of ghosting over the
 * newborn's first frame.
 */
/** The play ball's pose: position xyz + orientation quaternion xyzw. */
export type BallPose = [number, number, number, number, number, number, number];

export type SolverToMain =
  | { type: 'ready' }
  | {
      type: 'snapshot';
      buffer: ArrayBuffer;
      handState: HandState;
      generation: number;
      /** The play ball riding along, null while it is put away. Seven plain
       * numbers per message — not worth a second buffer pool. */
      ball: BallPose | null;
    };
